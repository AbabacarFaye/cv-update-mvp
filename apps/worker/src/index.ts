import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { workerConfig } from "@cv/server/config";
import { storage } from "@cv/server/storage";
import { log } from "@cv/server/log";
import { objectKey } from "@cv/contracts/foundation";

type Claim = { job_id: string | null; owner_id: string | null; lease_token: string | null; attempt: number; disposition: string };
async function main() {
  const config = workerConfig();
  if (!config.enabled) { log("worker", "demo_disabled"); return; }
  const db = postgres(config.connection, { ssl: config.ssl, max: 1, connect_timeout: 5, idle_timeout: 20, connection: { statement_timeout: 5000, application_name: "foundation_worker" }, onnotice: () => {} });
  const files = storage(config.storage);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  let backoff = 1000;
  log("worker", "started");
  try {
    while (!stopping) {
      const requestId = randomUUID();
      try {
        const messages = await db<{ msg_id: string }[]>`select msg_id::text from foundation_private.read_message()`;
        backoff = 1000;
        if (!messages.length) { await delay(2000); continue; }
        const messageId = messages[0].msg_id;
        const [claim] = await db<Claim[]>`select * from foundation_private.claim_message(${messageId}::bigint)`;
        if (!claim) continue;
        if (claim.disposition !== "claimed" || !claim.job_id || !claim.owner_id || !claim.lease_token) {
          log("worker", "message_resolved", { requestId, messageId, jobId: claim.job_id ?? undefined, errorCode: claim.disposition }); continue;
        }
        const started = Date.now();
        const fields = { requestId, jobId: claim.job_id, attempt: claim.attempt };
        const timeout = AbortSignal.timeout(20_000);
        log("worker", "claimed", fields);
        try {
          await files.write(objectKey(claim.owner_id, claim.job_id), timeout);
          if (timeout.aborted || Date.now()-started >= 20_000) throw new Error("attempt_timeout");
          const confirmation = db<{ ok: boolean }[]>`select foundation_private.complete_job(${claim.job_id}::uuid,${claim.lease_token}::uuid) as ok`;
          const cancel = () => { void confirmation.cancel().catch(() => {}); };
          timeout.addEventListener("abort", cancel, { once: true });
          let result: { ok: boolean };
          try { [result] = await confirmation; }
          finally { timeout.removeEventListener("abort", cancel); }
          if (result.ok) {
            await db`select foundation_private.archive_message(${messageId}::bigint)`;
            log("worker", "succeeded", { ...fields, durationMs: Date.now()-started });
          } else log("worker", "lease_lost", fields);
        } catch {
          await db`select foundation_private.fail_attempt(${claim.job_id}::uuid,${claim.lease_token}::uuid)`;
          log("worker", "attempt_failed", { ...fields, errorCode: "dependency_failure", durationMs: Date.now()-started }, "error");
        }
      } catch {
        log("worker", "database_unavailable", { requestId, errorCode: "database_unavailable" }, "error");
        await delay(backoff); backoff = Math.min(backoff * 2, 30_000);
      }
    }
  } finally { files.close(); await db.end({ timeout: 5 }); log("worker", "stopped"); }
}
main().catch(() => { log("worker", "startup_failed", { errorCode: "invalid_configuration" }, "error"); process.exitCode = 1; });
