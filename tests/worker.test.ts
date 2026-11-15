import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pauseAfterR2 } from "../apps/worker/src/validation-pause.ts";

const exec = promisify(execFile);
const cwd = new URL("../", import.meta.url);
test("AC-4 : une pause désactivée ou une autre tâche continue sans signal", async () => {
  for (const target of [null, "other-job"]) {
    await pauseAfterR2("job", target, () => assert.fail("La tâche ne doit pas être suspendue"));
  }
});
test("AC-4 : le processus ciblé reste suspendu avant confirmation puis supporte SIGKILL", async () => {
  // Réutilise la validation existante. Les marqueurs disque ne prouvent pas une reprise SQL/R2.
  const { stdout } = await exec(process.execPath, ["scripts/validate-worker-pause.mjs"], { cwd, timeout: 15000 });
  const result = JSON.parse(stdout);
  for (const key of ["targetPausedAfterSyntheticWrite", "confirmationAbsentAtPause", "killedBySigkill", "confirmationAbsentAfterKill", "unrelatedJobContinued"]) {
    assert.equal(result[key], true, key);
  }
});
test("AC-1, AC-6 : le vrai worker refuse une configuration absente sans divulgation", async () => {
  await assert.rejects(exec(process.execPath, ["--import", "tsx", "apps/worker/src/index.ts"], {
    cwd, timeout: 10000, env: { PATH: process.env.PATH, R2_SECRET_ACCESS_KEY: "sentinel-secret" },
  }), (error: Error & { code: number; stdout: string; stderr: string }) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout + error.stderr, /startup_failed/);
    assert.doesNotMatch(error.stdout + error.stderr, /sentinel-secret/);
    return true;
  });
});
