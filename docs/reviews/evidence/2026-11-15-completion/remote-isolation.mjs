// Two existing synthetic Auth accounts, temporary allowlist grant, then restore.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runCommand, workspaceBin } from "./cli.mjs";
import { parseEnv } from "node:util";

const root = new URL("../../../../", import.meta.url);
const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { createServerClient } = require("@supabase/ssr");
const web = parseEnv(readFileSync(new URL(".env.web.validation", root), "utf8"));
const users = JSON.parse(readFileSync(new URL(".env.validation.auth.json", root), "utf8"));
const a = users.find(user => user.kind === "allowed");
const b = users.find(user => user.kind === "denied");
assert.ok(a?.id && b?.id && a.id !== b.id);
assert.equal(new URL(web.APP_ORIGIN).protocol, "https:");
const result = { project: "vheammupwxowyttjqxcr", temporaryGrant: false, restored: false, firstAccount: {}, secondAccount: {}, crossAccess: {}, result: "BLOCKED" };
const supabaseBin = workspaceBin("supabase");

async function sql(query) {
  await runCommand(supabaseBin, ["db", "query", "--remote=vheammupwxowyttjqxcr", "--yes", "--output-format", "json", query]);
}
async function session(user) {
  const jar = new Map();
  const client = createServerClient(web.SUPABASE_URL, web.SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  assert.ifError(error);
  assert.equal(data.user?.id, user.id);
  return [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}
async function request(cookie, method, path, body) {
  const response = await fetch(`${web.APP_ORIGIN}${path}`, { method, headers: { cookie, ...(method === "POST" ? { origin: web.APP_ORIGIN, "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  let data = null;
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}
async function waitSucceeded(cookie, id) {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    const response = await request(cookie, "GET", `/api/foundation/jobs/${id}`);
    if (response.status === 200 && response.data?.status === "succeeded") return response;
    if (response.status !== 200 || response.data?.status === "failed") throw new Error("own_job_not_succeeded");
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("worker_timeout");
}
try {
  await sql(`insert into public.foundation_allowed_users(user_id) values ('${b.id}'::uuid) on conflict do nothing`);
  result.temporaryGrant = true;
  const cookieA = await session(a);
  const cookieB = await session(b);
  const createA = await request(cookieA, "POST", "/api/foundation/jobs", { requestKey: randomUUID() });
  const createB = await request(cookieB, "POST", "/api/foundation/jobs", { requestKey: randomUUID() });
  assert.equal(createA.status, 202);
  assert.equal(createB.status, 202);
  assert.notEqual(createA.data?.id, createB.data?.id);
  const idA = createA.data.id, idB = createB.data.id;
  const ownA = await waitSucceeded(cookieA, idA);
  const ownB = await waitSucceeded(cookieB, idB);
  const downloadA = await request(cookieA, "GET", `/api/foundation/jobs/${idA}/download`);
  const downloadB = await request(cookieB, "GET", `/api/foundation/jobs/${idB}/download`);
  // Do not print, store or request either signed URL.
  result.firstAccount = { create: createA.status, ownRead: ownA.status, ownStatus: ownA.data.status, ownDownload: downloadA.status };
  result.secondAccount = { create: createB.status, ownRead: ownB.status, ownStatus: ownB.data.status, ownDownload: downloadB.status };
  const crossReadAB = await request(cookieA, "GET", `/api/foundation/jobs/${idB}`);
  const crossReadBA = await request(cookieB, "GET", `/api/foundation/jobs/${idA}`);
  const crossLinkAB = await request(cookieA, "GET", `/api/foundation/jobs/${idB}/download`);
  const crossLinkBA = await request(cookieB, "GET", `/api/foundation/jobs/${idA}/download`);
  result.crossAccess = { aReadsB: crossReadAB.status, bReadsA: crossReadBA.status, aLinksB: crossLinkAB.status, bLinksA: crossLinkBA.status };
  assert.deepEqual(Object.values(result.crossAccess), [404, 404, 404, 404]);
  assert.equal(downloadA.status, 200);
  assert.equal(downloadB.status, 200);
  result.result = "PASS";
} catch (error) {
  result.reason = String(error?.message ?? "unknown").slice(0, 100);
} finally {
  if (result.temporaryGrant) {
    try { await sql(`delete from public.foundation_allowed_users where user_id='${b.id}'::uuid`); result.restored = true; }
    catch { result.restoreFailed = true; result.result = "BLOCKED"; }
  }
  console.log(JSON.stringify(result, null, 2));
}
