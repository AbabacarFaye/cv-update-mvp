// One dedicated validation fixture. Never prints credentials or signed URLs.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { workspaceBin } from "./cli.mjs";
import { accessSync, constants, writeFileSync } from "node:fs";
import postgres from "postgres";

const require = createRequire(new URL("../../../../packages/server/package.json", import.meta.url));
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const root = new URL("../../../../", import.meta.url).pathname;
const evidenceFile = new URL("remote-admin-purge-result.json", import.meta.url);
const project = "vheammupwxowyttjqxcr";
const owner = "64a3b2f5-b36b-4392-8f34-43f5cdb16001";
const body = "Synthetic remote admin purge fixture\n";
const tsxBin = workspaceBin("tsx");
accessSync(new URL(".env.admin", new URL("../../../../", import.meta.url)), constants.R_OK);
const id = randomUUID();
const key = `foundation/${owner}/${id}/result.txt`;
const result = {
  project, bucket: "cv-update-validation", fixture: id, targetVerified: false,
  adminRoleVerified: false, tlsVerificationConfigured: false, objectPresentBefore: false,
  rowPresentBefore: false, archivePresentBefore: false, objectAbsentWhileRowPresent: false,
  archivePresentWhileRowPresent: false, firstPurge: null, objectAbsentAfter: false,
  rowAbsentAfter: false, archiveAbsentAfter: false, queueAbsentAfter: false,
  secondPurge: null, result: "BLOCKED",
};

const url = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
assert.equal(process.env.APP_ENV, "validation");
assert.equal(process.env.R2_BUCKET, "cv-update-validation");
assert.equal(url.port, "5432");
assert.equal(decodeURIComponent(url.username), `postgres.${project}`);
assert.ok(url.hostname.endsWith(".pooler.supabase.com"));
assert.equal(url.pathname, "/postgres");
assert.ok(process.env.NODE_EXTRA_CA_CERTS);
url.searchParams.delete("sslmode");
result.targetVerified = true;
result.tlsVerificationConfigured = true;

const db = postgres(url.toString(), { ssl: "verify-full", max: 3, connect_timeout: 30,
  connection: { statement_timeout: 10000 } });
const client = new S3Client({ endpoint: process.env.R2_ENDPOINT, region: "auto",
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
const bucket = "cv-update-validation";
const object = { Bucket: bucket, Key: key };
let inserted = false;
let uploaded = false;

async function getObject() {
  try {
    const response = await client.send(new GetObjectCommand(object), { abortSignal: AbortSignal.timeout(10000) });
    return { exists: true, text: await response.Body.transformToString() };
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) return { exists: false };
    throw error;
  }
}
async function counts() {
  const [row] = await db`select
    (select count(*)::int from public.foundation_jobs where id=${id}::uuid) as jobs,
    (select count(*)::int from pgmq.q_foundation_demo where foundation_private.message_job_id(message)=${id}::uuid) as queued,
    (select count(*)::int from pgmq.a_foundation_demo where foundation_private.message_job_id(message)=${id}::uuid) as archived,
    (select count(*)::int from foundation_private.purge_candidates() where job_id=${id}::uuid) as candidates`;
  return row;
}
function runAdmin() {
  const child = spawn(tsxBin, ["--env-file=.env.admin", "scripts/admin.ts", "purge", id],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.on("data", chunk => { stdout += chunk.toString(); });
  child.stderr.resume();
  const finished = new Promise(resolve => {
    child.once("error", error => resolve({ exit: null, events: [], launchError: error.code ?? error.name }));
    child.once("close", code => {
    const events = stdout.split("\n").flatMap(line => {
      try { const entry = JSON.parse(line); return entry.event ? [entry.event] : []; }
      catch { return []; }
    });
      resolve({ exit: code, events });
    });
  });
  return { child, finished };
}

try {
  const [identity] = await db`select current_user as role,
    current_database() as database,
    exists(select 1 from supabase_migrations.schema_migrations where version='202611090001') as migration,
    exists(select 1 from auth.users where id=${owner}::uuid) as owner_exists,
    has_function_privilege(current_user,'foundation_private.purge_job(uuid)','EXECUTE') as may_purge`;
  assert.equal(identity.role, "postgres");
  assert.equal(identity.database, "postgres");
  assert.equal(identity.migration, true);
  assert.equal(identity.owner_exists, true);
  assert.equal(identity.may_purge, true);
  result.adminRoleVerified = true;

  const put = await client.send(new PutObjectCommand({ ...object, Body: body,
    ContentType: "text/plain; charset=utf-8" }), { abortSignal: AbortSignal.timeout(10000) });
  assert.equal(put.$metadata.httpStatusCode, 200);
  uploaded = true;
  assert.deepEqual(await getObject(), { exists: true, text: body });
  result.objectPresentBefore = true;

  await db.begin(async tx => {
    await tx`insert into public.foundation_jobs
      (id, owner_id, request_key, status, attempt_count, object_key, completed_at, created_at, updated_at)
      values (${id}::uuid, ${owner}::uuid, ${randomUUID()}::uuid, 'succeeded', 1, ${key},
        now()-interval '8 days', now()-interval '8 days', now()-interval '8 days')`;
    const [message] = await tx`select pgmq.send('foundation_demo',
      jsonb_build_object('version',1,'job_id',${id}::uuid)) as msg_id`;
    const [archived] = await tx`select pgmq.archive('foundation_demo',${message.msg_id}::bigint) as done`;
    assert.equal(archived.done, true);
  });
  inserted = true;
  const before = await counts();
  assert.deepEqual([before.jobs, before.queued, before.archived, before.candidates], [1, 0, 1, 1]);
  result.rowPresentBefore = true;
  result.archivePresentBefore = true;

  let first;
  await db.begin(async tx => {
    await tx`select id from public.foundation_jobs where id=${id}::uuid for update`;
    first = runAdmin();
    let absent = false;
    for (let attempt = 0; attempt < 32; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      absent = !(await getObject()).exists;
      if (absent) break;
      if (first.child.exitCode !== null) break;
    }
    if (!absent) {
      first.child.kill("SIGKILL");
      throw new Error("object_not_removed_while_row_locked");
    }
    const during = await counts();
    assert.deepEqual([during.jobs, during.archived], [1, 1]);
    result.objectAbsentWhileRowPresent = true;
    result.archivePresentWhileRowPresent = true;
  });
  result.firstPurge = await first.finished;
  assert.equal(result.firstPurge.exit, 0);
  assert.ok(result.firstPurge.events.includes("purged"));

  const after = await counts();
  result.objectAbsentAfter = !(await getObject()).exists;
  result.rowAbsentAfter = after.jobs === 0;
  result.archiveAbsentAfter = after.archived === 0;
  result.queueAbsentAfter = after.queued === 0;
  assert.equal(result.objectAbsentAfter, true);
  assert.equal(result.rowAbsentAfter, true);
  assert.equal(result.archiveAbsentAfter, true);
  assert.equal(result.queueAbsentAfter, true);

  result.secondPurge = await runAdmin().finished;
  assert.equal(result.secondPurge.exit, 0);
  assert.ok(result.secondPurge.events.includes("purge_skipped"));
  const final = await counts();
  assert.deepEqual([final.jobs, final.archived, final.queued], [0, 0, 0]);
  assert.equal((await getObject()).exists, false);
  result.result = "PASS";
} catch (error) {
  result.errorCode = error?.code ?? error?.name ?? "unknown";
} finally {
  if (result.result !== "PASS") {
    try {
      if (uploaded && (await getObject()).exists)
        await client.send(new DeleteObjectCommand(object), { abortSignal: AbortSignal.timeout(10000) });
      if (inserted) await db.begin(async tx => {
        await tx`delete from pgmq.q_foundation_demo where foundation_private.message_job_id(message)=${id}::uuid`;
        await tx`delete from pgmq.a_foundation_demo where foundation_private.message_job_id(message)=${id}::uuid`;
        await tx`delete from public.foundation_jobs where id=${id}::uuid`;
      });
      result.fixtureCleanup = true;
    } catch { result.fixtureCleanup = false; }
  }
  client.destroy();
  await db.end({ timeout: 5 });
  writeFileSync(evidenceFile, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (result.result !== "PASS") process.exitCode = 1;
}
