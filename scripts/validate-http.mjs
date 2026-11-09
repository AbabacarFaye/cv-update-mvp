import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const webDir = new URL("../apps/web/", import.meta.url);
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: webDir,
  env: {
    ...process.env,
    APP_ENV: "local", APP_ORIGIN: origin, FOUNDATION_DEMO_ENABLED: "true",
    SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_PUBLISHABLE_KEY: "example",
    R2_ENDPOINT: "https://example.r2.cloudflarestorage.com", R2_BUCKET: "example",
    R2_ACCESS_KEY_ID: "example", R2_SECRET_ACCESS_KEY: "example",
  },
  stdio: "ignore",
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error("Le serveur web s'est arrêté avant le contrôle HTTP");
    try {
      const response = await fetch(`${origin}/api/health/live`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Attendre uniquement le démarrage local. */ }
    await delay(100);
  }
  assert.ok(ready, "Le serveur web ne répond pas après six secondes");
  const health = await fetch(`${origin}/api/health/live`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const page = await fetch(`${origin}/foundation`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("cache-control") ?? "", /no-store/);
  const html = await page.text();
  assert.ok(html.includes("Connexion de validation"));
  assert.ok(html.includes('name="password"'));

  const id = "00000000-0000-0000-0000-000000000000";
  for (const route of [`/api/foundation/jobs/${id}`, `/api/foundation/jobs/${id}/download`]) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, "unauthorized");
    assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
  }
  for (const [requestOrigin, expected] of [[origin, 401], ["https://other.example", 403]]) {
    const response = await fetch(`${origin}/api/foundation/jobs`, {
      method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" },
      body: JSON.stringify({ requestKey: crypto.randomUUID() }),
    });
    assert.equal(response.status, expected);
  }
  console.log("HTTP local réussi : santé, écran sans cache, accès anonymes et origine étrangère.");
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(2000)]);
  }
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}
