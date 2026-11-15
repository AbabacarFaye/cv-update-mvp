import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../../../", import.meta.url);

export function workspaceBin(name) {
  const path = fileURLToPath(new URL(`node_modules/.bin/${name}`, root));
  accessSync(path, constants.X_OK);
  return path;
}

export async function runCommand(bin, args, input) {
  return await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: fileURLToPath(root), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", chunk => { out += chunk.toString(); });
    child.stderr.resume();
    child.stdin.on("error", reject);
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve(out) : reject(new Error(`${bin}_exit_${code}`)));
    child.stdin.end(input);
  });
}

export function railwayCli() {
  if (process.env.RAILWAY_CLI) {
    accessSync(process.env.RAILWAY_CLI, constants.X_OK);
    return { bin: process.env.RAILWAY_CLI, prefix: [] };
  }
  return { bin: "npx", prefix: ["--no-install", "@railway/cli"] };
}

export async function checkRailwayCli(cli) {
  await runCommand(cli.bin, [...cli.prefix, "--version"]);
}
