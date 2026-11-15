// Local process test of the validation-only pause and a forced SIGKILL. Storage and SQL are synthetic markers.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const folder = await mkdtemp(join(tmpdir(), "cv-worker-pause-"));
const jobId = randomUUID();
const otherId = randomUUID();
const childCode = `
  import { writeFile } from 'node:fs/promises';
  import { join } from 'node:path';
  import { pauseAfterR2 } from './apps/worker/src/validation-pause.ts';
  const dir = process.env.PAUSE_TEST_DIR;
  await writeFile(join(dir, 'object'), 'synthetic object');
  await pauseAfterR2(process.env.PAUSE_TEST_JOB_ID, process.env.PAUSE_TEST_TARGET_ID, () => console.log('paused_after_r2'));
  await writeFile(join(dir, 'sql-confirmed'), 'confirmed');
  console.log('completed');
`;
function start(targetId) {
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", childCode], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, PAUSE_TEST_DIR: folder, PAUSE_TEST_JOB_ID: jobId, PAUSE_TEST_TARGET_ID: targetId },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.resume();
  return child;
}
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function untilLine(child, wanted) {
  return await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => finish(new Error("pause_timeout")), 5000);
    const onData = chunk => {
      buffer += chunk.toString();
      if (buffer.split("\n").includes(wanted)) finish();
    };
    const onExit = () => finish(new Error("worker_exited_before_pause"));
    const finish = error => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
      if (error) reject(error); else resolve(true);
    };
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}
const result = { targetPausedAfterSyntheticWrite: false, confirmationAbsentAtPause: false, killedBySigkill: false, confirmationAbsentAfterKill: false, unrelatedJobContinued: false };
let child;
try {
  child = start(jobId);
  await untilLine(child, "paused_after_r2");
  result.targetPausedAfterSyntheticWrite = (await readFile(join(folder, "object"), "utf8")) === "synthetic object";
  result.confirmationAbsentAtPause = !(await exists(join(folder, "sql-confirmed")));
  assert.equal(result.targetPausedAfterSyntheticWrite, true);
  assert.equal(result.confirmationAbsentAtPause, true);
  child.kill("SIGKILL");
  const [code, signal] = await new Promise(resolve => child.once("exit", (...args) => resolve(args)));
  result.killedBySigkill = code === null && signal === "SIGKILL";
  result.confirmationAbsentAfterKill = !(await exists(join(folder, "sql-confirmed")));
  assert.equal(result.killedBySigkill, true);
  assert.equal(result.confirmationAbsentAfterKill, true);
  await rm(join(folder, "object"));
  child = start(otherId);
  const [otherCode] = await new Promise(resolve => child.once("exit", (...args) => resolve(args)));
  result.unrelatedJobContinued = otherCode === 0 && await exists(join(folder, "sql-confirmed"));
  assert.equal(result.unrelatedJobContinued, true);
  console.log(JSON.stringify({ ...result, verdict: "PASS" }));
} finally {
  if (child?.exitCode === null) child.kill("SIGKILL");
  await rm(folder, { recursive: true, force: true });
}
