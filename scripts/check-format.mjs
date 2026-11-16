import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import prettier from "prettier";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const staged = args.includes("--staged");
const baseIndex = args.indexOf("--base");
if (staged && baseIndex !== -1) throw new Error("Choisir --staged ou --base.");
if (baseIndex !== -1 && (!args[baseIndex + 1] || args.length !== 2)) {
  throw new Error("Usage : format:check [--staged | --base <commit>].");
}
if (staged && args.length !== 1)
  throw new Error("Usage : format:check --staged.");
if (!staged && baseIndex === -1 && args.length !== 0) {
  throw new Error("Usage : format:check [--staged | --base <commit>].");
}

function gitFiles(gitArgs) {
  return execFileSync("git", gitArgs, { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

const files = new Set();
if (baseIndex !== -1) {
  for (const file of gitFiles([
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=ACMR",
    `${args[baseIndex + 1]}...HEAD`,
  ]))
    files.add(file);
} else if (staged) {
  for (const file of gitFiles([
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--diff-filter=ACMR",
  ]))
    files.add(file);
} else {
  for (const gitArgs of [
    ["diff", "--name-only", "-z", "--diff-filter=ACMR"],
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ]) {
    for (const file of gitFiles(gitArgs)) files.add(file);
  }
}

const supported = [...files].filter((file) =>
  /\.(?:[cm]?[jt]sx?|css|json|ya?ml)$/.test(file),
);
if (supported.length === 0) {
  console.log("Aucun fichier de code ou de configuration à vérifier.");
  process.exit(0);
}

if (staged) {
  let invalid = 0;
  for (const file of supported) {
    const info = await prettier.getFileInfo(file, {
      ignorePath: ".prettierignore",
    });
    if (info.ignored) continue;
    const content = execFileSync("git", ["show", `:${file}`], {
      encoding: "utf8",
    });
    const config = (await prettier.resolveConfig(file)) ?? {};
    if (!(await prettier.check(content, { ...config, filepath: file }))) {
      console.error(`Format invalide : ${file}`);
      invalid++;
    }
  }
  if (invalid === 0) console.log("Format des fichiers indexés conforme.");
  process.exit(invalid ? 1 : 0);
}

const result = spawnSync(
  process.execPath,
  [require.resolve("prettier/bin/prettier.cjs"), "--check", ...supported],
  {
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
