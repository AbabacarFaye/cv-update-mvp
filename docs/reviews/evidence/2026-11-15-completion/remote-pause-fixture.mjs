// Create one designated synthetic validation job after the pause-enabled worker is online.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const root = new URL("../../../../", import.meta.url);
const id = process.argv[2];
assert.match(id ?? "", /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
const users = JSON.parse(readFileSync(new URL(".env.validation.auth.json", root), "utf8"));
const owner = users.find(user => user.kind === "allowed")?.id;
assert.match(owner ?? "", /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);

async function sql(query, readOnly) {
  const child = spawn("node_modules/.bin/supabase", ["db", "query", "--remote=vheammupwxowyttjqxcr", readOnly ? "--read-only" : "--yes", "--output-format", "json", query],
    { cwd: root.pathname, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; child.stdout.on("data", chunk => { out += chunk.toString(); }); child.stderr.resume();
  const exit = await new Promise(resolve => child.once("exit", resolve));
  assert.equal(exit, 0, "remote_sql_failed");
  const start = out.indexOf("{");
  assert.ok(start >= 0, "remote_sql_missing_json");
  return JSON.parse(out.slice(start)).rows;
}
const [counts] = await sql("select (select count(*)::int from pgmq.q_foundation_demo) as queued,(select count(*)::int from public.foundation_jobs where status in ('queued','running')) as active", true);
assert.deepEqual(counts, { queued: 0, active: 0 }, "existing_work_must_finish_first");
const requestKey = randomUUID();
const rows = await sql(`with job as (
  insert into public.foundation_jobs(id,owner_id,request_key)
  values ('${id}'::uuid,'${owner}'::uuid,'${requestKey}'::uuid)
  returning id
) select pgmq.send('foundation_demo',jsonb_build_object('version',1,'job_id',id)) as message_id from job`, false);
assert.equal(rows.length, 1, "fixture_insert_or_enqueue_failed");
console.log(JSON.stringify({ syntheticJobCreated: true, messageEnqueued: true }));
