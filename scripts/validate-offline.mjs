import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webConfig, workerConfig } from "../packages/server/src/config.ts";

const example = {
  APP_ENV: "local",
  APP_ORIGIN: "http://localhost:3000",
  FOUNDATION_DEMO_ENABLED: "true",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "example",
  WORKER_DATABASE_URL: "postgresql://foundation_worker:example@127.0.0.1:54322/postgres",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  R2_BUCKET: "example",
  R2_ACCESS_KEY_ID: "example",
  R2_SECRET_ACCESS_KEY: "example",
};

assert.equal(webConfig(example).enabled, true);
assert.equal(workerConfig(example).ssl, false);
for (const key of [
  "APP_ENV", "APP_ORIGIN", "FOUNDATION_DEMO_ENABLED", "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY", "R2_ENDPOINT", "R2_BUCKET",
  "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
]) {
  const missing = { ...example };
  delete missing[key];
  assert.throws(() => webConfig(missing), `Le web accepte ${key} absent`);
}
for (const key of ["WORKER_DATABASE_URL", "R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
  const missing = { ...example };
  delete missing[key];
  assert.throws(() => workerConfig(missing), `Le worker accepte ${key} absent`);
}
assert.throws(() => webConfig({ ...example, APP_ENV: "production" }));
assert.throws(() => workerConfig({ ...example, APP_ENV: "production" }));
assert.throws(() => workerConfig({ ...example, WORKER_DATABASE_URL: "postgres://postgres:example@127.0.0.1/postgres" }));
assert.throws(() => workerConfig({ ...example, WORKER_DATABASE_URL: "postgres://foundation_worker:example@remote.example/postgres" }));
assert.equal(workerConfig({
  ...example, APP_ENV: "validation", APP_ORIGIN: "https://validation.example",
  WORKER_DATABASE_URL: "postgres://foundation_worker:example@db.example/postgres?sslmode=disable",
}).ssl, "verify-full");

const staticDir = fileURLToPath(new URL("../apps/web/.next/static/", import.meta.url));
assert.ok((await stat(staticDir)).isDirectory(), "Exécutez pnpm build avant validate:offline");
async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name.endsWith(".js")) {
      const code = await readFile(file, "utf8");
      for (const secretName of ["R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "WORKER_DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
        assert.ok(!code.includes(secretName), `Nom de variable secrète dans un bundle public : ${secretName}`);
      }
    }
  }
}
await walk(staticDir);
console.log("Contrôles hors ligne réussis : configuration, rôle worker, TLS et bundles publics.");
