import { access, readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
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
  "data/ui/landing-page.json",
  "data/localization/zh-CN.json",
  "data/localization/en-US.json",
  "src/client/index.html",
  "src/client/styles.css",
  "src/client/main.js",
  "src/shared/ui-contract.mjs",
  "scripts/serve.mjs",
  "tests/landing-page-contract.test.mjs",
  "docs/landing-page-data.md",
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

async function assertDirectoryReady(relativePath) {
  const entries = await readdir(path.join(root, relativePath), { withFileTypes: true });
  const hasPlaceholder = entries.some((entry) => entry.name === ".gitkeep");
  const hasRealContent = entries.some((entry) => entry.name !== ".gitkeep");
  if (!hasPlaceholder && !hasRealContent) {
    throw new Error(`${relativePath} must contain .gitkeep or real files`);
  }
}

async function main() {
  await Promise.all(requiredPaths.map(assertPathExists));

  for (const directory of ["data", "src/client", "src/server", "src/shared", "tests", "docs"]) {
    await assertDirectoryReady(directory);
  }

  const agentsText = await readFile(path.join(root, "AGENTS.md"), "utf8");
  for (const phrase of requiredAgentPhrases) {
    if (!agentsText.includes(phrase)) {
      throw new Error(`AGENTS.md is missing required phrase: ${phrase}`);
    }
  }

  await runNodeTests();

  console.log("verify: repository skeleton and policy checks passed");
}

async function runNodeTests() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", "tests/landing-page-contract.test.mjs"], {
      cwd: root,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`node --test tests exited with code ${code}`));
      }
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
