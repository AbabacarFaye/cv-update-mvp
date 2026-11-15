// Read-only observation for the designated synthetic job after the validation worker pause or recovery.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";

const root = new URL("../../../../", import.meta.url);
const require = createRequire(new URL("../../../../packages/server/package.json", import.meta.url));
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const [phase, id] = process.argv.slice(2);
assert.ok(["paused", "recovered", "fresh"].includes(phase), "phase_must_be_paused_recovered_or_fresh");
assert.match(id ?? "", /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
const users = JSON.parse(readFileSync(new URL(".env.validation.auth.json", root), "utf8"));
const owner = users.find(user => user.kind === "allowed")?.id;
assert.match(owner ?? "", /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
const web = parseEnv(readFileSync(new URL(".env.web.validation", root), "utf8"));
assert.equal(web.R2_BUCKET, "cv-update-validation");
const objectKey = `foundation/${owner}/${id}/result.txt`;
const query = `select status,attempt_count,object_key is null as object_key_null,
  object_key='${objectKey}' as object_key_matches,completed_at is null as completed_at_null,
  coalesce(lease_until>clock_timestamp(),false) as lease_active,
  (select count(*)::int from pgmq.a_foundation_demo where message->>'job_id'='${id}') as archived
  from public.foundation_jobs where id='${id}'::uuid and owner_id='${owner}'::uuid`;
const child = spawn("node_modules/.bin/supabase", ["db", "query", "--remote=vheammupwxowyttjqxcr", "--read-only", "--output-format", "json", query],
  { cwd: root.pathname, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; child.stdout.on("data", chunk => { out += chunk.toString(); }); child.stderr.resume();
const exit = await new Promise(resolve => child.once("exit", resolve));
assert.equal(exit, 0, "remote_read_failed");
const start = out.indexOf("{");
assert.ok(start >= 0, "remote_read_missing_json");
const rows = JSON.parse(out.slice(start)).rows;
assert.equal(rows.length, 1, "dedicated_job_not_found");
const row = rows[0];
const client = new S3Client({ endpoint: web.R2_ENDPOINT, region: "auto", credentials: { accessKeyId: web.R2_ACCESS_KEY_ID, secretAccessKey: web.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
let objectExact = false;
try {
  const object = await client.send(new GetObjectCommand({ Bucket: "cv-update-validation", Key: objectKey }), { abortSignal: AbortSignal.timeout(15000) });
  objectExact = object.$metadata.httpStatusCode === 200 && (await object.Body.transformToString()) === "CV a jour : socle operationnel.\n";
} finally { client.destroy(); }
const observed = { phase, objectExact, status: row.status, attempts: row.attempt_count,
  noSqlConfirmation: row.object_key_null && row.completed_at_null,
  leaseActive: row.lease_active, objectKeyMatches: row.object_key_matches === true, archived: row.archived };
const pass = phase === "paused"
  ? objectExact && observed.status === "running" && observed.attempts === 1 && observed.noSqlConfirmation && observed.leaseActive && observed.archived === 0
  : objectExact && observed.status === "succeeded" && observed.attempts >= (phase === "fresh" ? 1 : 2) && observed.attempts <= (phase === "fresh" ? 1 : 3) && observed.objectKeyMatches && !observed.noSqlConfirmation && observed.archived === 1;
console.log(JSON.stringify({ ...observed, verdict: pass ? "PASS" : "FAIL" }, null, 2));
if (!pass) process.exitCode = 1;
