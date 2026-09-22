import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./helpers.mjs";

const args = new Set(process.argv.slice(2));
const wantAll = args.size === 0 || args.has("--all");
const want = (flag) => wantAll || args.has(flag);

function run(label, command, commandArgs, options = {}) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: command !== process.execPath,
    env: process.env,
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    return { label, ok: false };
  }
  return { label, ok: result.status === 0 };
}

const results = [];

if (want("--unit")) {
  const unitFiles = fs
    .readdirSync(path.join(ROOT, "tests/regression"))
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => path.join("tests/regression", file));
  results.push(run("unit", process.execPath, ["--test", ...unitFiles]));
}

if (want("--cdk") && process.env.SKIP_CDK !== "1") {
  results.push(
    run("cdk/payments", "python", ["-m", "pytest", "candle-saas-cdk/tests/test_payment_processor.py", "-q"]),
  );
}

if (want("--http")) {
  results.push(run("http", process.execPath, ["tests/regression/http/run.mjs"]));
}

if (want("--browser") && process.env.SKIP_BROWSER !== "1") {
  results.push(
    run("browser", process.platform === "win32" ? "npx.cmd" : "npx", [
      "playwright",
      "test",
      "--config",
      "tests/regression/playwright.config.mjs",
    ]),
  );
}

console.log("\n== summary ==");
for (const item of results) {
  console.log(`${item.ok ? "pass" : "FAIL"}  ${item.label}`);
}
if (!results.length) {
  console.error("No suites selected.");
  process.exit(2);
}
process.exit(results.every((item) => item.ok) ? 0 : 1);
