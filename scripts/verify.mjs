import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const requiredPaths = [
  "AGENTS.md",
  "README.md",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "data",
  "src/client",
  "src/server",
  "src/shared",
  "tests",
  "scripts",
  "docs",
  ".github/workflows/ci.yml",
];

const requiredAgentPhrases = [
  "先数据设计，再写代码",
  "代码与数据分离",
  "localization key",
  "高内聚、低耦合",
  "模拟层与视觉层分离",
  "面向未来扩展",
  "执行顺序",
  "npm run verify",
];

async function assertPathExists(relativePath) {
  await access(path.join(root, relativePath));
}

async function assertDirectoryTracked(relativePath) {
  const entries = await readdir(path.join(root, relativePath));
  if (!entries.includes(".gitkeep")) {
    throw new Error(`${relativePath} must contain .gitkeep until real files exist`);
  }
}

async function main() {
  await Promise.all(requiredPaths.map(assertPathExists));

  for (const directory of ["data", "src/client", "src/server", "src/shared", "tests", "docs"]) {
    await assertDirectoryTracked(directory);
  }

  const agentsText = await readFile(path.join(root, "AGENTS.md"), "utf8");
  for (const phrase of requiredAgentPhrases) {
    if (!agentsText.includes(phrase)) {
      throw new Error(`AGENTS.md is missing required phrase: ${phrase}`);
    }
  }

  console.log("verify: repository skeleton and policy checks passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
