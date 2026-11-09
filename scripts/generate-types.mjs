import { spawnSync } from "node:child_process";
import { writeFileSync, renameSync } from "node:fs";
const result = spawnSync("supabase", ["gen", "types", "typescript", "--local"], { encoding: "utf8" });
if (result.status !== 0 || !result.stdout.includes("export type Database")) {
  console.error("Génération impossible. Les types existants sont conservés."); process.exit(1);
}
const file = "packages/contracts/src/database.types.ts";
writeFileSync(`${file}.tmp`, result.stdout); renameSync(`${file}.tmp`, file);
