import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { runCommand, workspaceBin } from "../docs/reviews/evidence/2026-11-15-completion/cli.mjs";
import { restoreWorkerKey } from "../docs/reviews/evidence/2026-11-15-completion/restore-worker-key.mjs";

function simulatedCli(t: TestContext, initial: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "review-railway-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const stateFile = join(dir, "state.json");
  const cliFile = join(dir, "railway.js");
  writeFileSync(stateFile, JSON.stringify({ key: "valid", statusCalls: 0, ...initial }));
  writeFileSync(cliFile, `#!/usr/bin/env node
const fs = require('node:fs');
const [file, action] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
if (action === 'status') {
  state.statusCalls++;
  fs.writeFileSync(file, JSON.stringify(state));
  if (state.failFirstStatus && state.statusCalls === 1) process.exit(2);
  console.log(JSON.stringify({ deploymentId: String(state.statusCalls), status: state.healthy === false ? 'FAILED' : 'SUCCESS', stopped: false }));
} else if (action === 'set') {
  let value = '';
  process.stdin.on('data', chunk => value += chunk);
  process.stdin.on('end', () => {
    if (!state.rejectSet) state.key = value;
    fs.writeFileSync(file, JSON.stringify(state));
    if (state.failSetResponse || state.rejectSet) process.exitCode = 2;
  });
} else if (action === 'key') console.log(JSON.stringify({ key: state.key }));
`);
  chmodSync(cliFile, 0o755);
  const call = (action: string, input?: string) => runCommand(cliFile, [stateFile, action], input);
  const status = async () => JSON.parse(await call("status"));
  return {
    state: () => JSON.parse(readFileSync(stateFile, "utf8")),
    restore: () => restoreWorkerKey({ status, setKey: (value: string) => call("set", value),
      waitDeploy: async () => status(),
      deployedKeyMatches: async () => (JSON.parse(await call("key"))).key === "valid", validKey: "valid" }),
  };
}

test("restores key even when initial status fails", async t => {
  const cli = simulatedCli(t, { key: "invalid", failFirstStatus: true });
  assert.deepEqual(await cli.restore(), { deployedKeyMatchesLocal: true, online: true, confirmed: true });
  assert.equal(cli.state().key, "valid");
});

test("confirms restoration after CLI reports failed mutation response", async t => {
  const cli = simulatedCli(t, { key: "invalid", failSetResponse: true });
  const result = await cli.restore();
  assert.equal(result.confirmed, true);
  assert.equal(result.mutationErrorKind, "Error");
});

test("unconfirmed key or unhealthy worker fails restoration", async t => {
  const rejected = simulatedCli(t, { key: "invalid", rejectSet: true });
  assert.equal((await rejected.restore()).confirmed, false);
  const unhealthy = simulatedCli(t, { key: "invalid", healthy: false });
  assert.equal((await unhealthy.restore()).confirmed, false);
});

test("child launch failure rejects without an uncaught error", async () => {
  await assert.rejects(runCommand("/nonexistent/review-cli", []), { code: "ENOENT" });
  assert.ok(workspaceBin("supabase"));
});
