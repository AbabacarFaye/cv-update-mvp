import assert from "node:assert/strict";
import { test } from "node:test";
import { workerConfig, webConfig } from "../packages/server/src/config.ts";

const env = {
  APP_ENV: "validation", APP_ORIGIN: "https://validation.example",
  FOUNDATION_DEMO_ENABLED: "true", SUPABASE_URL: "https://supabase.example",
  SUPABASE_PUBLISHABLE_KEY: "synthetic-public",
  WORKER_DATABASE_URL: "postgres://foundation_worker:synthetic-secret@db.example/postgres?sslmode=disable",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com", R2_BUCKET: "synthetic",
  R2_ACCESS_KEY_ID: "synthetic-key", R2_SECRET_ACCESS_KEY: "synthetic-secret",
};
const id = "abcdefab-2222-4333-8444-555555555555";

test("AC-6 : la pause est absente par défaut et normalise son UUID en validation", () => {
  assert.equal(workerConfig(env).pauseAfterR2JobId, null);
  assert.equal(workerConfig({ ...env, FOUNDATION_PAUSE_AFTER_R2_JOB_ID: id.toUpperCase() }).pauseAfterR2JobId, id);
});
for (const value of ["", " ", "not-a-uuid", `${id}suffix`, ` ${id}`]) {
  test(`AC-6 : la pause refuse un identifiant invalide ${JSON.stringify(value)}`, () => {
    assert.throws(() => workerConfig({ ...env, FOUNDATION_PAUSE_AFTER_R2_JOB_ID: value }), /Configuration invalide : FOUNDATION_PAUSE_AFTER_R2_JOB_ID/);
  });
}
for (const appEnv of ["local", "production"]) {
  test(`AC-6 : la pause est interdite en ${appEnv}`, () => {
    assert.throws(() => workerConfig({ ...env, APP_ENV: appEnv, FOUNDATION_DEMO_ENABLED: "false",
      WORKER_DATABASE_URL: "postgres://foundation_worker:synthetic-secret@127.0.0.1/postgres",
      FOUNDATION_PAUSE_AFTER_R2_JOB_ID: id }), /FOUNDATION_PAUSE_AFTER_R2_JOB_ID/);
  });
}
test("AC-5, AC-6 : le worker impose son rôle dédié et TLS distant", () => {
  const config = workerConfig(env);
  assert.equal(config.ssl, "verify-full");
  assert.equal(new URL(config.connection).searchParams.has("sslmode"), false);
  assert.throws(() => workerConfig({ ...env, WORKER_DATABASE_URL: env.WORKER_DATABASE_URL.replace("foundation_worker", "postgres") }), /rôle dédié/);
});
for (const key of Object.keys(env)) {
  test(`AC-6 : une configuration sans ${key} est refusée sans secret`, () => {
    const missing: NodeJS.ProcessEnv = { ...env };
    delete missing[key];
    const load = key.startsWith("SUPABASE") ? webConfig : workerConfig;
    assert.throws(() => load(missing), (error: Error) => {
      assert.ok(error.message.includes(key));
      assert.ok(!error.message.includes("synthetic-secret"));
      return true;
    });
  });
}
test("AC-6 : la démonstration est refusée en production", () => {
  assert.throws(() => workerConfig({ ...env, APP_ENV: "production" }), /interdite en production/);
  assert.throws(() => webConfig({ ...env, APP_ENV: "production" }), /interdite en production/);
});
