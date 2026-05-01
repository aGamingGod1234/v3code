import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";

const COMPONENTS_DIR = join(import.meta.dirname, "..", "src", "components");
const BROWSER_TEST_SUFFIX = ".browser.tsx";
const SCREENSHOT_DIR = "__screenshots__";

function collectBrowserTests(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === SCREENSHOT_DIR) continue;
      files.push(...collectBrowserTests(path));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(BROWSER_TEST_SUFFIX)) {
      files.push(path);
    }
  }

  return files;
}

function assertDirectory(path: string): void {
  if (!statSync(path).isDirectory()) {
    throw new Error(`Expected browser test root to be a directory: ${path}`);
  }
}

assertDirectory(COMPONENTS_DIR);

const browserTests = collectBrowserTests(COMPONENTS_DIR)
  .map((file) =>
    relative(join(import.meta.dirname, ".."), file)
      .split(sep)
      .join("/"),
  )
  .sort();

if (browserTests.length === 0) {
  throw new Error("No browser test files were found.");
}

for (const testFile of browserTests) {
  console.log(`\n[vitest-browser] ${testFile}`);
  const result = spawnSync(
    process.execPath,
    ["vitest", "run", "--config", "vitest.browser.config.ts", testFile],
    {
      cwd: join(import.meta.dirname, ".."),
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
