import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (existsSync(".git") && !process.env.CI) {
  const current = spawnSync(
    "git",
    ["config", "--local", "--get", "core.hooksPath"],
    {
      encoding: "utf8",
    },
  );
  if (current.status === 1) {
    const result = spawnSync(
      "git",
      ["config", "--local", "core.hooksPath", ".githooks"],
      {
        stdio: "inherit",
      },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  } else if (current.status !== 0) {
    process.exit(current.status ?? 1);
  } else if (current.stdout.trim() !== ".githooks") {
    console.warn(
      `Git utilise déjà core.hooksPath=${current.stdout.trim()}; installer le hook manuellement.`,
    );
  }
}
