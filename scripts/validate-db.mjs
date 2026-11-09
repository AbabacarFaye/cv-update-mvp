import assert from "node:assert/strict";
import postgres from "postgres";
import { databaseConfig } from "../packages/server/src/config.ts";

// Read only introspection. Apply migrations separately, after confirming the target project.
const config = databaseConfig("MIGRATION_DATABASE_URL");
if (config.appEnv === "production") throw new Error("Validation de la démonstration interdite en production");
const db = postgres(config.connection, {
  ssl: config.ssl, max: 1, connect_timeout: 5,
  connection: { statement_timeout: 10000, application_name: "foundation_validation" },
  onnotice: () => {},
});
try {
  const [objects] = await db`select
    exists(select 1 from pg_extension where extname='pgmq') as queue_extension,
    to_regclass('public.foundation_allowed_users') is not null as allowed_users,
    to_regclass('public.foundation_jobs') is not null as jobs,
    to_regclass('pgmq.q_foundation_demo') is not null as active_queue,
    to_regclass('pgmq.a_foundation_demo') is not null as archive_queue`;
  for (const [name, present] of Object.entries(objects)) assert.equal(present, true, `${name} manque`);

  const columns = await db`select column_name from information_schema.columns where table_schema='public' and table_name='foundation_jobs'`;
  const present = new Set(columns.map((row) => row.column_name));
  for (const column of ["id", "owner_id", "request_key", "status", "attempt_count", "lease_token", "lease_until", "object_key", "error_code", "created_at", "updated_at", "completed_at"]) {
    assert.ok(present.has(column), `Colonne manquante : ${column}`);
  }
  const [constraints] = await db`select
    count(*) filter (where contype='f')::int as foreign_keys,
    count(*) filter (where contype='u')::int as unique_keys,
    count(*) filter (where contype='c')::int as checks
    from pg_constraint where conrelid='public.foundation_jobs'::regclass`;
  assert.ok(constraints.foreign_keys >= 1 && constraints.unique_keys >= 1 && constraints.checks >= 4);

  const roles = await db`select role_name, table_name,
    has_table_privilege(role_name,table_name,'INSERT') as insert_allowed,
    has_table_privilege(role_name,table_name,'UPDATE') as update_allowed,
    has_table_privilege(role_name,table_name,'DELETE') as delete_allowed,
    has_table_privilege(role_name,table_name,'TRUNCATE') as truncate_allowed
    from (values ('anon'),('authenticated'),('foundation_worker')) as roles(role_name)
    cross join (values ('public.foundation_jobs'),('public.foundation_allowed_users'),('pgmq.q_foundation_demo')) as tables(table_name)`;
  for (const row of roles) {
    for (const operation of ["insert_allowed", "update_allowed", "delete_allowed", "truncate_allowed"]) {
      assert.equal(row[operation], false, `${row.role_name} possède ${operation} sur ${row.table_name}`);
    }
  }
  const [functions] = await db`select
    has_function_privilege('authenticated','public.foundation_create_job(uuid)','EXECUTE') as client_create,
    has_function_privilege('foundation_worker','foundation_private.read_message()','EXECUTE') as worker_read,
    has_function_privilege('foundation_worker','foundation_private.reconcile_orphan(uuid)','EXECUTE') as worker_admin,
    has_function_privilege('anon','foundation_private.read_message()','EXECUTE') as anon_read,
    has_schema_privilege('foundation_worker','pgmq','USAGE') as direct_queue`;
  assert.deepEqual(functions, {
    client_create: true, worker_read: true, worker_admin: false,
    anon_read: false, direct_queue: false,
  });
  console.log("Base vérifiée : extension, file, colonnes, contraintes et privilèges.");
} finally {
  await db.end({ timeout: 5 });
}
