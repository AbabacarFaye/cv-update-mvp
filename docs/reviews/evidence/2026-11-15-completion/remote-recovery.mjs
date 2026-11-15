// Dedicated synthetic fixtures in validation Supabase. Does not touch existing jobs.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runCommand, workspaceBin } from "./cli.mjs";
const root = new URL("../../../../", import.meta.url);
const users = JSON.parse(readFileSync(new URL(".env.validation.auth.json", root), "utf8"));
const owner = users.find(user => user.kind === "allowed")?.id;
assert.match(owner, /^[0-9a-f-]{36}$/i);
const result = { project: "vheammupwxowyttjqxcr", unknownNoLease: null, validLease: null, orphan: null, exhaustedClaim: null, result: "BLOCKED" };
const supabaseBin = workspaceBin("supabase");
async function sql(query, readOnly = false) {
  const args = ["db", "query", "--remote=vheammupwxowyttjqxcr", ...(readOnly ? ["--read-only"] : ["--yes"]), "--output-format", "json", query];
  const out = await runCommand(supabaseBin, args);
  const start = out.indexOf("{");
  if (start < 0) throw new Error("sql_no_json");
  return JSON.parse(out.slice(start)).rows;
}
async function state(id) {
  const rows = await sql(`select status,error_code,attempt_count,
    (select count(*)::int from pgmq.q_foundation_demo where message->>'job_id'='${id}') as queued_messages,
    (select count(*)::int from pgmq.q_foundation_demo where message->>'job_id'='${id}' and vt>clock_timestamp()) as invisible_messages,
    (select count(*)::int from pgmq.a_foundation_demo where message->>'job_id'='${id}') as archived_messages
    from public.foundation_jobs where id='${id}'::uuid`, true);
  return rows[0];
}
async function waitFor(id, predicate) {
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    const row = await state(id);
    if (predicate(row)) return row;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("wait_timeout");
}
async function fixture(status, attempt, lease = null, version = null) {
  const id = randomUUID();
  const request = randomUUID();
  await sql(`insert into public.foundation_jobs(id,owner_id,request_key,status,attempt_count,lease_token,lease_until)
    values('${id}'::uuid,'${owner}'::uuid,'${request}'::uuid,'${status}',${attempt},${lease ? `'${lease}'::uuid` : "null"},${lease ? "clock_timestamp()+interval '90 seconds'" : "null"})`);
  if (version !== null) await sql(`select pgmq.send('foundation_demo',jsonb_build_object('version',${version},'job_id','${id}'::uuid)) as msg_id`);
  return id;
}
try {
  const [counts] = await sql("select (select count(*)::int from pgmq.q_foundation_demo) as queue_count,(select count(*)::int from public.foundation_jobs where status in ('queued','running')) as active_count", true);
  assert.deepEqual(counts, { queue_count: 0, active_count: 0 });

  const unknownId = await fixture("queued", 0, null, 999);
  const unknown = await waitFor(unknownId, row => row?.status === "failed");
  result.unknownNoLease = { status: unknown.status, code: unknown.error_code, attempts: unknown.attempt_count, queued: unknown.queued_messages, archived: unknown.archived_messages };
  assert.equal(unknown.error_code, "unsupported_contract");
  assert.equal(unknown.attempt_count, 0);
  assert.equal(unknown.queued_messages, 0);
  assert.equal(unknown.archived_messages, 1);

  const lease = randomUUID();
  const protectedId = await fixture("running", 1, lease, 999);
  // Worker reads the message but claim_message must preserve an unexpired lease.
  const protectedState = await waitFor(protectedId, row => row?.status === "running" && row.queued_messages === 1 && row.invisible_messages === 1);
  const [leaseBefore] = await sql(`select lease_token='${lease}'::uuid as same_lease, lease_until>clock_timestamp() as valid_lease from public.foundation_jobs where id='${protectedId}'::uuid`, true);
  result.validLease = { protectedStatus: protectedState.status, queuedBeforeExpiry: protectedState.queued_messages, invisibleAfterWorkerRead: protectedState.invisible_messages === 1, sameLease: leaseBefore.same_lease, validAtObservation: leaseBefore.valid_lease };
  assert.equal(leaseBefore.same_lease, true);
  assert.equal(leaseBefore.valid_lease, true);
  await sql(`update public.foundation_jobs set lease_until=clock_timestamp()-interval '1 second' where id='${protectedId}'::uuid and lease_token='${lease}'::uuid`);
  await sql(`update pgmq.q_foundation_demo set vt=clock_timestamp() where message->>'job_id'='${protectedId}'`);
  const resolved = await waitFor(protectedId, row => row?.status === "failed");
  result.validLease.afterExpiry = { status: resolved.status, code: resolved.error_code, queued: resolved.queued_messages, archived: resolved.archived_messages };
  assert.equal(resolved.error_code, "unsupported_contract");
  assert.equal(resolved.archived_messages, 1);

  const orphanId = await fixture("queued", 0);
  // The CLI read-only role cannot EXECUTE the administration function, even for a SELECT.
  const candidates = await sql(`select count(*)::int as n from foundation_private.orphan_candidates() where job_id='${orphanId}'::uuid`);
  const reconciled = await sql(`select foundation_private.reconcile_orphan('${orphanId}'::uuid) as changed`);
  const reconciledAgain = await sql(`select foundation_private.reconcile_orphan('${orphanId}'::uuid) as changed`);
  const orphan = await state(orphanId);
  result.orphan = { proposed: candidates[0].n === 1, changed: reconciled[0].changed, secondChanged: reconciledAgain[0].changed, status: orphan.status, code: orphan.error_code };
  assert.deepEqual(result.orphan, { proposed: true, changed: true, secondChanged: false, status: "failed", code: "orphaned_message" });

  // A worker resolution of attempt_count=3 is narrower than three real R2 failures.
  const exhaustedId = await fixture("queued", 3, null, 1);
  const exhausted = await waitFor(exhaustedId, row => row?.status === "failed");
  result.exhaustedClaim = { status: exhausted.status, code: exhausted.error_code, attempts: exhausted.attempt_count, archived: exhausted.archived_messages, note: "fixture starts at attempt_count=3; no remote R2 failure sequence" };
  assert.equal(exhausted.error_code, "attempts_exhausted");
  assert.equal(exhausted.archived_messages, 1);
  result.result = "PARTIAL";
} catch (error) {
  result.reason = String(error?.message ?? "unknown").slice(0, 100);
}
console.log(JSON.stringify(result, null, 2));
