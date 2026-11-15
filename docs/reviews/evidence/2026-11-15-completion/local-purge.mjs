// Dedicated eight-day-old local SQL fixture and validation R2 object. No secret output.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";
import postgres from "postgres";

const root = new URL("../../../../", import.meta.url);
const require = createRequire(new URL("../../../../packages/server/package.json", import.meta.url));
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const envFile = name => parseEnv(readFileSync(new URL(name, root), "utf8"));
const validationWorker = envFile(".env.worker.validation");
const validationWeb = envFile(".env.web.validation");
assert.equal(new URL(process.env.MIGRATION_DATABASE_URL).hostname, "127.0.0.1");
assert.equal(validationWorker.R2_BUCKET, "cv-update-validation");
assert.equal(validationWeb.R2_BUCKET, "cv-update-validation");
const owner = process.argv[2];
assert.match(owner, /^[0-9a-f-]{36}$/i);
const id = randomUUID();
const key = `foundation/${owner}/${id}/result.txt`;
const db = postgres(process.env.MIGRATION_DATABASE_URL, { max: 1 });
const makeClient = conf => new S3Client({ endpoint: conf.R2_ENDPOINT, region: "auto", credentials: { accessKeyId: conf.R2_ACCESS_KEY_ID, secretAccessKey: conf.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
const worker = makeClient(validationWorker);
const web = makeClient(validationWeb);
const result = { fixture: "dedicated_synthetic_8_days_old", target: "local_postgres_validation_r2", firstPurge: null, secondPurge: null, objectAbsent: false, rowAbsent: false, result: "BLOCKED" };
async function runAdmin() {
  const env = { ...process.env, ...validationWorker, APP_ENV: "local", APP_ORIGIN: "http://localhost:3000", MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL, PATH: `/private/tmp/cv-update-verify-20261115/bin:${process.env.PATH}` };
  const child = spawn("pnpm", ["admin", "purge", id], { cwd: root.pathname, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; child.stdout.on("data", data => { stdout += data.toString(); }); child.stderr.resume();
  const exit = await new Promise(resolve => child.once("exit", resolve));
  const events = stdout.split("\n").flatMap(line => { try { const item = JSON.parse(line); return item.event ? [item.event] : []; } catch { return []; } });
  return { exit, events };
}
let inserted = false;
let uploaded = false;
try {
  const put = await worker.send(new PutObjectCommand({ Bucket: "cv-update-validation", Key: key, Body: "Synthetic purge fixture\n", ContentType: "text/plain" }));
  assert.equal(put.$metadata.httpStatusCode, 200);
  uploaded = true;
  await db`insert into public.foundation_jobs(id,owner_id,request_key,status,attempt_count,object_key,completed_at,created_at,updated_at)
    values(${id}::uuid,${owner}::uuid,${randomUUID()}::uuid,'succeeded',1,${key},now()-interval '8 days',now()-interval '8 days',now()-interval '8 days')`;
  inserted = true;
  result.firstPurge = await runAdmin();
  result.secondPurge = await runAdmin();
  const [count] = await db`select count(*)::int as n from public.foundation_jobs where id=${id}::uuid`;
  result.rowAbsent = count.n === 0;
  try { await web.send(new GetObjectCommand({ Bucket: "cv-update-validation", Key: key })); }
  catch (error) { result.objectAbsent = error?.$metadata?.httpStatusCode === 404; }
  assert.equal(result.firstPurge.exit, 0);
  assert.ok(result.firstPurge.events.includes("purged"));
  assert.equal(result.secondPurge.exit, 0);
  assert.ok(result.secondPurge.events.includes("purge_skipped"));
  assert.equal(result.objectAbsent, true);
  assert.equal(result.rowAbsent, true);
  result.result = "PASS";
} catch (error) {
  result.reason = String(error?.message ?? "unknown").slice(0, 100);
} finally {
  if (uploaded && !result.objectAbsent) {
    try { const del = await worker.send(new DeleteObjectCommand({ Bucket: "cv-update-validation", Key: key })); result.cleanupDeleteStatus = del.$metadata.httpStatusCode; }
    catch { result.cleanupFailed = true; }
  }
  if (inserted && !result.rowAbsent) await db`delete from public.foundation_jobs where id=${id}::uuid`;
  worker.destroy(); web.destroy(); await db.end();
  console.log(JSON.stringify(result, null, 2));
}
