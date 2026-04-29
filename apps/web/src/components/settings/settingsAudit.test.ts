import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SETTINGS_DIR = join(process.cwd(), "src", "components", "settings");
const ROUTES_DIR = join(process.cwd(), "src", "routes");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    return stat.isDirectory() ? walk(path) : [path];
  });
}

function readSourceFiles() {
  return [...walk(SETTINGS_DIR), ...walk(ROUTES_DIR)].filter(
    (path) => /\.(tsx?|jsx?)$/.test(path) && !path.endsWith("settingsAudit.test.ts"),
  );
}

function displayPath(path: string): string {
  return relative(process.cwd(), path).replace(/\\/g, "/");
}

describe("settings audit", () => {
  it("does not expose placeholder settings tabs", () => {
    for (const path of readSourceFiles()) {
      const source = readFileSync(path, "utf8");
      expect(source, displayPath(path)).not.toMatch(/Coming soon|StubPanel/);
    }
  });

  it("keeps GitHub sign-in to the single Git settings panel", () => {
    const matches = readSourceFiles().filter((path) =>
      readFileSync(path, "utf8").includes("<V3ConnectGitHubButton"),
    );
    expect(matches.map(displayPath)).toEqual(["src/components/settings/GitSettings.tsx"]);
  });
});
