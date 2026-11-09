import postgres from "postgres";
import { databaseConfig, storageConfig } from "../packages/server/src/config.ts";
import { storage } from "../packages/server/src/storage.ts";
import { log } from "../packages/server/src/log.ts";
import { UUID_PATTERN } from "../packages/contracts/src/foundation.ts";
async function main() {
  const config = databaseConfig("MIGRATION_DATABASE_URL");
  if (config.appEnv === "production") throw new Error("demo_admin_disabled");
  const [command, ...ids] = process.argv.slice(2);
  const db = postgres(config.connection, { ssl: config.ssl, max: 1, connect_timeout: 5, connection: { statement_timeout: 10000 }, onnotice: () => {} });
  try {
    if (command === "orphans") {
      const rows = await db`select * from foundation_private.orphan_candidates()`;
      rows.forEach(row => log("admin", "orphan_candidate", { jobId: row.job_id }));
    } else if (command === "reconcile") {
      if (!ids.length || ids.some(id => !UUID_PATTERN.test(id))) throw new Error("explicit_ids_required");
      for (const id of ids) {
        const [result] = await db`select foundation_private.reconcile_orphan(${id}::uuid) as changed`;
        log("admin", result.changed ? "orphan_reconciled" : "orphan_skipped", { jobId: id });
      }
    } else if (command === "purge-list") {
      const rows = await db`select * from foundation_private.purge_candidates()`;
      rows.forEach(row => log("admin", "purge_candidate", { jobId: row.job_id }));
    } else if (command === "purge") {
      if (!ids.length || ids.some(id => !UUID_PATTERN.test(id))) throw new Error("explicit_ids_required");
      const files = storage(storageConfig());
      try {
        for (const id of ids) {
          const [candidate] = await db`select * from foundation_private.purge_candidates() where job_id=${id}::uuid`;
          if (!candidate) { log("admin", "purge_skipped", { jobId: id }); continue; }
          await files.remove(candidate.object_key);
          const [result] = await db`select foundation_private.purge_job(${id}::uuid) as changed`;
          log("admin", result.changed ? "purged" : "purge_skipped", { jobId: id });
        }
      } finally { files.close(); }
    } else throw new Error("unknown_command");
  } finally { await db.end({ timeout: 5 }); }
}
main().catch(() => { log("admin", "operation_failed", { errorCode: "admin_failure" }, "error"); process.exitCode = 1; });
