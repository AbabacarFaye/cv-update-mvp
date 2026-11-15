import { UUID_PATTERN } from "@cv/contracts/foundation";

export type AppEnvironment = "local" | "validation" | "production";
function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Configuration manquante : ${key}`);
  return value;
}
function url(env: NodeJS.ProcessEnv, key: string) {
  try { return new URL(required(env, key)); } catch { throw new Error(`Configuration invalide : ${key}`); }
}
export function baseConfig(env: NodeJS.ProcessEnv = process.env) {
  const appEnv = required(env, "APP_ENV") as AppEnvironment;
  if (!["local", "validation", "production"].includes(appEnv)) throw new Error("Configuration invalide : APP_ENV");
  if (!["true", "false"].includes(required(env, "FOUNDATION_DEMO_ENABLED"))) throw new Error("Configuration invalide : FOUNDATION_DEMO_ENABLED");
  const enabled = env.FOUNDATION_DEMO_ENABLED === "true";
  if (appEnv === "production" && enabled) throw new Error("Démonstration interdite en production");
  const origin = url(env, "APP_ORIGIN");
  if (origin.origin !== env.APP_ORIGIN || (appEnv !== "local" && origin.protocol !== "https:")) throw new Error("Configuration invalide : APP_ORIGIN");
  return { appEnv, enabled, origin: origin.origin };
}
export function storageConfig(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = url(env, "R2_ENDPOINT");
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".r2.cloudflarestorage.com") || endpoint.username || endpoint.password || endpoint.search) throw new Error("Configuration invalide : R2_ENDPOINT");
  return { endpoint: endpoint.origin, bucket: required(env, "R2_BUCKET"), accessKeyId: required(env, "R2_ACCESS_KEY_ID"), secretAccessKey: required(env, "R2_SECRET_ACCESS_KEY") };
}
export function webConfig(env: NodeJS.ProcessEnv = process.env) {
  const base = baseConfig(env);
  const supabase = url(env, "SUPABASE_URL");
  if (base.appEnv !== "local" && supabase.protocol !== "https:") throw new Error("Configuration invalide : SUPABASE_URL");
  return { ...base, supabaseUrl: supabase.href, publishableKey: required(env, "SUPABASE_PUBLISHABLE_KEY"), storage: storageConfig(env) };
}
export function databaseConfig(key: "WORKER_DATABASE_URL" | "MIGRATION_DATABASE_URL", env: NodeJS.ProcessEnv = process.env) {
  const base = baseConfig(env);
  const connection = url(env, key);
  if (!["postgres:", "postgresql:"].includes(connection.protocol)) throw new Error(`Configuration invalide : ${key}`);
  if (key === "WORKER_DATABASE_URL" && decodeURIComponent(connection.username).split(".")[0] !== "foundation_worker") throw new Error("Le worker doit utiliser son rôle dédié");
  // TLS is mandatory remotely; remove URL sslmode so it cannot disable verification.
  const local = base.appEnv === "local" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(connection.hostname);
  if (base.appEnv === "local" && !local) throw new Error("La base locale doit être sur loopback");
  connection.searchParams.delete("sslmode");
  return { ...base, connection: connection.toString(), ssl: local ? false as const : "verify-full" as const };
}
export function workerConfig(env: NodeJS.ProcessEnv = process.env) {
  const database = databaseConfig("WORKER_DATABASE_URL", env);
  const pauseJobId = env.FOUNDATION_PAUSE_AFTER_R2_JOB_ID;
  if (pauseJobId !== undefined && (database.appEnv !== "validation" || !UUID_PATTERN.test(pauseJobId))) {
    throw new Error("Configuration invalide : FOUNDATION_PAUSE_AFTER_R2_JOB_ID");
  }
  return { ...database, storage: storageConfig(env), pauseAfterR2JobId: pauseJobId?.toLowerCase() ?? null };
}
