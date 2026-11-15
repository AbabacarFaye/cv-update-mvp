// Dedicated remote fixture. Temporarily installs a fictitious worker R2 key, then restores the local validation key.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { checkRailwayCli, railwayCli, runCommand, workspaceBin } from "./cli.mjs";
import { restoreWorkerKey } from "./restore-worker-key.mjs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
const root = new URL("../../../../", import.meta.url);
const require = createRequire(new URL("../../../../packages/server/package.json", import.meta.url));
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const local = parseEnv(readFileSync(new URL(".env.worker.validation", root), "utf8"));
const users = JSON.parse(readFileSync(new URL(".env.validation.auth.json", root), "utf8"));
const owner = users.find(user => user.kind === "allowed")?.id;
const project = "e0e8a716-5eec-4ece-b0f1-11b081a0ba9f";
const supabase = "vheammupwxowyttjqxcr";
assert.match(owner, /^[0-9a-f-]{36}$/i);
assert.equal(local.R2_BUCKET, "cv-update-validation");
const result = { fixture: "dedicated remote R2 failures", attempts: [], exhausted: null, recovery: null, restoration: null, verdict: "BLOCKED" };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const supabaseBin = workspaceBin("supabase");
const railway = railwayCli();
await checkRailwayCli(railway);
const rail = args => runCommand(railway.bin, [...railway.prefix, ...args, "--service", "worker", "--project", project, "--environment", "production", "--json"]);
async function status() { const s = JSON.parse(await rail(["service", "status"])); assert.equal(s.name, "worker"); return s; }
async function setKey(value) { await runCommand(railway.bin, [...railway.prefix, "variable", "set", "R2_ACCESS_KEY_ID", "--stdin", "--service", "worker", "--project", project, "--environment", "production", "--json"], value); }
async function deployedKeyMatches() {
  const vars = JSON.parse(await rail(["variable", "list"]));
  return vars.R2_ACCESS_KEY_ID === local.R2_ACCESS_KEY_ID;
}
async function waitDeploy(previous) {
  const until = Date.now() + 240000;
  while (Date.now() < until) {
    let s;
    try { s = await status(); } catch { await sleep(4000); continue; }
    if (s.deploymentId !== previous && s.status === "SUCCESS" && !s.stopped) return s;
    await sleep(4000);
  }
  throw new Error("railway_deployment_timeout");
}
async function sql(query, readOnly = false) {
  const out = await runCommand(supabaseBin, ["db", "query", `--remote=${supabase}`, readOnly ? "--read-only" : "--yes", "--output-format", "json", query]);
  const pos = out.indexOf("{");
  if (pos < 0) throw new Error("sql_no_json");
  return JSON.parse(out.slice(pos)).rows;
}
async function row(id) {
  const rows = await sql(`select status,error_code,attempt_count,object_key,(select count(*)::int from pgmq.q_foundation_demo where message->>'job_id'='${id}') as queued,(select count(*)::int from pgmq.a_foundation_demo where message->>'job_id'='${id}') as archived from public.foundation_jobs where id='${id}'::uuid`, true);
  return rows[0];
}
async function waitFor(id, predicate, ms = 110000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { const state = await row(id); if (predicate(state)) return state; await sleep(2000); }
  throw new Error("fixture_timeout");
}
async function create() {
  const id = randomUUID();
  await sql(`insert into public.foundation_jobs(id,owner_id,request_key) values('${id}'::uuid,'${owner}'::uuid,'${randomUUID()}'::uuid)`);
  await sql(`select pgmq.send('foundation_demo',jsonb_build_object('version',1,'job_id','${id}'::uuid)) as msg_id`);
  return id;
}
let restorationNeeded = false;
let recoveryKey;
try {
  assert.equal(await deployedKeyMatches(), true, "worker_key_does_not_match_local");
  const [counts] = await sql("select (select count(*)::int from pgmq.q_foundation_demo) as queue_count,(select count(*)::int from public.foundation_jobs where status in ('queued','running')) as active_count", true);
  assert.deepEqual(counts, { queue_count: 0, active_count: 0 });
  const before = await status();
  restorationNeeded = true;
  await setKey(`invalid-synthetic-${randomUUID()}`);
  const invalidDeployment = await waitDeploy(before.deploymentId);
  result.invalidDeploymentOnline = invalidDeployment.status === "SUCCESS";
  const id = await create();
  for (let n = 1; n <= 3; n++) {
    const failed = await waitFor(id, state => state?.status === "queued" && state.attempt_count === n);
    result.attempts.push({ number: n, queuedAfterFailure: failed.queued === 1 });
    assert.equal(failed.queued, 1);
    await sql(`update pgmq.q_foundation_demo set vt=clock_timestamp() where message->>'job_id'='${id}'`);
  }
  const exhausted = await waitFor(id, state => state?.status === "failed");
  result.exhausted = { status: exhausted.status, code: exhausted.error_code, attempts: exhausted.attempt_count, archived: exhausted.archived };
  assert.deepEqual(result.exhausted, { status: "failed", code: "attempts_exhausted", attempts: 3, archived: 1 });
} catch (error) { result.errorKind = String(error?.name ?? "unknown").slice(0, 50); }
finally {
  if (restorationNeeded) {
    try { result.restoration = await restoreWorkerKey({ status, setKey, waitDeploy, deployedKeyMatches, validKey: local.R2_ACCESS_KEY_ID }); }
    catch (error) { result.restoration = { failed: true, errorKind: String(error?.name ?? "unknown").slice(0, 50) }; }
  }
}
if (result.exhausted && result.restoration?.deployedKeyMatchesLocal && result.restoration?.online) {
  try {
    const id = await create();
    const state = await waitFor(id, row => row?.status === "succeeded");
    recoveryKey = state.object_key;
    result.recovery = { status: state.status, attempts: state.attempt_count, expectedKey: recoveryKey === `foundation/${owner}/${id}/result.txt` };
    result.verdict = result.attempts.length === 3 && result.attempts.every(a => a.queuedAfterFailure) && result.recovery.expectedKey ? "PASS" : "FAIL";
  } catch (error) { result.recovery = { failed: true, errorKind: String(error?.name ?? "unknown").slice(0, 50) }; }
}
if (recoveryKey) {
  const client = new S3Client({ endpoint: local.R2_ENDPOINT, region: "auto", credentials: { accessKeyId: local.R2_ACCESS_KEY_ID, secretAccessKey: local.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
  try {
    await client.send(new DeleteObjectCommand({ Bucket: "cv-update-validation", Key: recoveryKey }));
    try { await client.send(new GetObjectCommand({ Bucket: "cv-update-validation", Key: recoveryKey })); result.recovery.objectAbsent = false; }
    catch (error) { result.recovery.objectAbsent = error?.$metadata?.httpStatusCode === 404; }
  } catch { result.recovery.cleanupFailed = true; }
  client.destroy();
}
console.log(JSON.stringify(result, null, 2));
if (restorationNeeded && !result.restoration?.confirmed) process.exitCode = 1;
