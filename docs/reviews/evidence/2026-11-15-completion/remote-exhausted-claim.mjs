// Narrow validation worker check: starts at attempt_count=3, no simulated remote R2 failures.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runCommand, workspaceBin } from "./cli.mjs";
import { parseEnv } from "node:util";
const root = new URL("../../../../", import.meta.url);
const require = createRequire(new URL("../../../../packages/server/package.json", import.meta.url));
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const users = JSON.parse(readFileSync(new URL(".env.validation.auth.json", root), "utf8"));
const owner = users.find(user => user.kind === "allowed")?.id;
const conf = parseEnv(readFileSync(new URL(".env.worker.validation", root), "utf8"));
assert.match(owner, /^[0-9a-f-]{36}$/i);
assert.equal(conf.R2_BUCKET, "cv-update-validation");
const client = new S3Client({ endpoint: conf.R2_ENDPOINT, region: "auto", credentials: { accessKeyId: conf.R2_ACCESS_KEY_ID, secretAccessKey: conf.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
const result = { exhaustedClaim: null, recovery: null, cleanup: null, result: "BLOCKED" };
const supabaseBin = workspaceBin("supabase");
async function sql(query, readOnly = false) {
  const out = await runCommand(supabaseBin, ["db", "query", "--remote=vheammupwxowyttjqxcr", readOnly ? "--read-only" : "--yes", "--output-format", "json", query]);
  const start = out.indexOf("{");
  if (start < 0) throw new Error("sql_no_json");
  return JSON.parse(out.slice(start)).rows;
}
async function create(attempt) {
  const id = randomUUID();
  await sql(`insert into public.foundation_jobs(id,owner_id,request_key,status,attempt_count) values('${id}'::uuid,'${owner}'::uuid,'${randomUUID()}'::uuid,'queued',${attempt})`);
  await sql(`select pgmq.send('foundation_demo',jsonb_build_object('version',1,'job_id','${id}'::uuid)) as msg_id`);
  return id;
}
async function waitFor(id, expected) {
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    const rows = await sql(`select status,error_code,attempt_count,object_key,
      (select count(*)::int from pgmq.a_foundation_demo where message->>'job_id'='${id}') as archived
      from public.foundation_jobs where id='${id}'::uuid`, true);
    if (rows[0]?.status === expected) return rows[0];
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("worker_timeout");
}
let recoveryKey;
try {
  const [counts] = await sql("select (select count(*)::int from pgmq.q_foundation_demo) as queue_count,(select count(*)::int from public.foundation_jobs where status in ('queued','running')) as active_count", true);
  assert.deepEqual(counts, { queue_count: 0, active_count: 0 });
  const exhaustedId = await create(3);
  const exhausted = await waitFor(exhaustedId, "failed");
  result.exhaustedClaim = { status: exhausted.status, code: exhausted.error_code, attempts: exhausted.attempt_count, archived: exhausted.archived };
  assert.deepEqual(result.exhaustedClaim, { status: "failed", code: "attempts_exhausted", attempts: 3, archived: 1 });
  const recoveryId = await create(0);
  const recovery = await waitFor(recoveryId, "succeeded");
  recoveryKey = recovery.object_key;
  result.recovery = { status: recovery.status, attempts: recovery.attempt_count, archived: recovery.archived, expectedKey: recoveryKey === `foundation/${owner}/${recoveryId}/result.txt` };
  assert.equal(result.recovery.expectedKey, true);
  result.result = "PARTIAL";
} catch (error) { result.reason = String(error?.message ?? "unknown").slice(0, 100); }
finally {
  if (recoveryKey) {
    try {
      const del = await client.send(new DeleteObjectCommand({ Bucket: "cv-update-validation", Key: recoveryKey }));
      let absent = false;
      try { await client.send(new GetObjectCommand({ Bucket: "cv-update-validation", Key: recoveryKey })); }
      catch (error) { absent = error?.$metadata?.httpStatusCode === 404; }
      result.cleanup = { deleteStatus: del.$metadata.httpStatusCode, absent };
    } catch { result.cleanup = { failed: true }; }
  }
  client.destroy();
  console.log(JSON.stringify(result, null, 2));
}
