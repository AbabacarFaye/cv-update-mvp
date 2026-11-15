// Synthetic local PostgreSQL, real worker, validation R2 only. No credential output.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import postgres from "postgres";

const require = createRequire(new URL("../../../../packages/server/package.json", import.meta.url));
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const root = new URL("../../../../", import.meta.url);
const envFile = name => parseEnv(readFileSync(new URL(name, root), "utf8"));
const local = envFile(".env.worker");
const validation = envFile(".env.worker.validation");
assert.equal(new URL(process.env.MIGRATION_DATABASE_URL).hostname, "127.0.0.1");
assert.equal(new URL(local.WORKER_DATABASE_URL).hostname, "127.0.0.1");
assert.equal(validation.R2_BUCKET, "cv-update-validation");
const db = postgres(process.env.MIGRATION_DATABASE_URL, { max: 1 });
const owner = process.argv[2];
assert.match(owner, /^[0-9a-f-]{36}$/i);
const evidence = { target: "local_postgres_validation_r2", ownerSynthetic: true, failedAttempts: [], staleLease: null, nextTask: null, cleanup: null };
const client = new S3Client({ endpoint: validation.R2_ENDPOINT, region: "auto", credentials: { accessKeyId: validation.R2_ACCESS_KEY_ID, secretAccessKey: validation.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
function startWorker(validCredentials) {
  const env = { ...process.env, ...local, ...validation, APP_ENV: "local", APP_ORIGIN: "http://localhost:3000", WORKER_DATABASE_URL: local.WORKER_DATABASE_URL, R2_BUCKET: "cv-update-validation" };
  if (!validCredentials) { env.R2_ACCESS_KEY_ID = "synthetic-invalid"; env.R2_SECRET_ACCESS_KEY = "synthetic-invalid"; }
  const p = spawn(process.execPath, ["apps/worker/dist/index.js"], { cwd: root.pathname, env, stdio: ["ignore", "pipe", "pipe"] });
  const events = [];
  let buffer = "";
  p.stdout.on("data", chunk => {
    buffer += chunk.toString();
    const lines = buffer.split("\n"); buffer = lines.pop();
    for (const line of lines) { try { const event = JSON.parse(line); events.push({ event: event.event, jobId: event.jobId, attempt: event.attempt }); } catch {} }
  });
  p.stderr.resume();
  return { p, events };
}
async function stopWorker(worker) {
  if (worker.p.exitCode !== null) return;
  worker.p.kill("SIGTERM");
  await Promise.race([new Promise(resolve => worker.p.once("exit", resolve)), delay(5000)]);
  if (worker.p.exitCode === null) worker.p.kill("SIGKILL");
}
async function job(id) {
  const [row] = await db`select status, attempt_count, error_code, lease_token, object_key from public.foundation_jobs where id=${id}::uuid`;
  return row;
}
async function waitFor(id, predicate, onPoll) {
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    const row = await job(id);
    onPoll?.(row);
    if (predicate(row)) return row;
    await delay(80);
  }
  throw new Error("wait_timeout");
}
async function createQueued() {
  const [row] = await db`insert into public.foundation_jobs(owner_id,request_key) values(${owner}::uuid,${randomUUID()}::uuid) returning id`;
  await db`select pgmq.send('foundation_demo',jsonb_build_object('version',1,'job_id',${row.id}::uuid))`;
  return row.id;
}
let badWorker;
let goodWorker;
let goodKey;
try {
  const exhaustedId = await createQueued();
  badWorker = startWorker(false);
  let oldLease = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const row = await waitFor(exhaustedId, x => x.status === "queued" && x.attempt_count === attempt, x => {
      if (x.status === "running" && x.lease_token && !oldLease) oldLease = x.lease_token;
    });
    evidence.failedAttempts.push({ attempt: row.attempt_count, status: row.status });
    await db`update pgmq.q_foundation_demo set vt=clock_timestamp() where message->>'job_id'=${exhaustedId}`;
  }
  const failed = await waitFor(exhaustedId, x => x.status === "failed");
  assert.equal(failed.attempt_count, 3);
  assert.equal(failed.error_code, "attempts_exhausted");
  assert.ok(oldLease, "old_lease_not_observed");
  const [complete] = await db`select foundation_private.complete_job(${exhaustedId}::uuid,${oldLease}::uuid) as changed`;
  const [fail] = await db`select foundation_private.fail_attempt(${exhaustedId}::uuid,${oldLease}::uuid) as changed`;
  evidence.staleLease = { capturedFromRunningTask: true, completeRejected: !complete.changed, failRejected: !fail.changed, finalStatus: (await job(exhaustedId)).status, finalError: failed.error_code, attempts: failed.attempt_count };
  assert.equal(complete.changed, false);
  assert.equal(fail.changed, false);
  await stopWorker(badWorker);
  const nextId = await createQueued();
  goodWorker = startWorker(true);
  const succeeded = await waitFor(nextId, x => x.status === "succeeded");
  goodKey = succeeded.object_key;
  evidence.nextTask = { status: succeeded.status, attempts: succeeded.attempt_count, sameBucket: true, objectKeyExpected: goodKey === `foundation/${owner}/${nextId}/result.txt` };
  assert.equal(evidence.nextTask.objectKeyExpected, true);
  assert.ok(badWorker.events.filter(x => x.event === "attempt_failed" && x.jobId === exhaustedId).length >= 3);
  evidence.workerEvents = { attemptFailed: badWorker.events.filter(x => x.event === "attempt_failed" && x.jobId === exhaustedId).length, exhaustionResolved: badWorker.events.some(x => x.event === "message_resolved" && x.jobId === exhaustedId), nextSucceeded: goodWorker.events.some(x => x.event === "succeeded" && x.jobId === nextId) };
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "BLOCKED";
  evidence.reason = String(error?.message ?? "unknown").slice(0, 100);
} finally {
  if (badWorker) await stopWorker(badWorker);
  if (goodWorker) await stopWorker(goodWorker);
  if (goodKey) {
    try {
      const del = await client.send(new DeleteObjectCommand({ Bucket: "cv-update-validation", Key: goodKey }));
      let absent = false;
      try { await client.send(new GetObjectCommand({ Bucket: "cv-update-validation", Key: goodKey })); }
      catch (error) { absent = error?.$metadata?.httpStatusCode === 404; }
      evidence.cleanup = { deleteStatus: del.$metadata.httpStatusCode, absent };
    } catch { evidence.cleanup = { failed: true }; }
  }
  client.destroy();
  await db.end();
  console.log(JSON.stringify(evidence, null, 2));
}
