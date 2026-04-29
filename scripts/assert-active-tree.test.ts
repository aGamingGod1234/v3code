import { describe, expect, it } from "vitest";

import { evaluatePath, findBlocked } from "./assert-active-tree.ts";

describe("evaluatePath", () => {
  // The user's amendment phrasing uses an extra `v3code-main/` prefix to denote
  // the project subdirectory. In git-relative terms (what `git diff --name-only`
  // produces), the OUTER stale tree appears as `apps/...` / `packages/...` and
  // the INNER active tree appears as `v3code-main/apps/...` / `v3code-main/packages/...`.
  it.each([
    ["apps/web/foo.ts", "block", "outer stale apps"],
    ["packages/contracts/bar.ts", "block", "outer stale packages"],
    ["v3code-main/apps/web/foo.ts", "allow", "inner active apps"],
    ["v3code-main/packages/contracts/bar.ts", "allow", "inner active packages"],
    ["package.json", "allow", "root config"],
    ["scripts/foo.ts", "allow", "outer scripts (not in BLOCK list)"],
    ["v3code-main/scripts/foo.ts", "allow", "inner scripts"],
    ["v3code-main/.docs/note.md", "allow", "inner docs"],
    ["apps/web/sub/v3code-main/foo.ts", "block", "outer prefix wins (edge case)"],
    ["v3code-main/apps/web/v3code-main/foo.ts", "allow", "inner active wins (edge case)"],
    ["", "allow", "empty path"],
    ["a", "allow", "single-segment non-blocked"],
  ])("returns %s for %s (%s)", (path, expected) => {
    expect(evaluatePath(path)).toBe(expected);
  });

  it("normalizes Windows backslashes to forward slashes", () => {
    expect(evaluatePath("apps\\web\\foo.ts")).toBe("block");
    expect(evaluatePath("v3code-main\\apps\\web\\foo.ts")).toBe("allow");
    expect(evaluatePath("packages\\contracts\\bar.ts")).toBe("block");
  });

  it("allows root apps and packages when running from the nested active checkout", () => {
    expect(evaluatePath("apps/web/foo.ts", "")).toBe("allow");
    expect(evaluatePath("packages/contracts/bar.ts", "")).toBe("allow");
  });
});

describe("findBlocked", () => {
  it("returns paths blocked by the matcher, preserving order", () => {
    const diff = ["v3code-main/apps/a.ts", "apps/b.ts", "package.json", "packages/c.ts"].join("\n");
    expect(findBlocked(diff)).toEqual(["apps/b.ts", "packages/c.ts"]);
  });

  it("ignores blank lines and trims whitespace", () => {
    const diff = "  apps/a.ts  \n\n  v3code-main/apps/b.ts\n";
    expect(findBlocked(diff)).toEqual(["apps/a.ts"]);
  });

  it("returns an empty array when nothing is blocked", () => {
    const diff = "v3code-main/apps/a.ts\npackage.json";
    expect(findBlocked(diff)).toEqual([]);
  });

  it("handles an empty diff output", () => {
    expect(findBlocked("")).toEqual([]);
  });

  it("blocks paths that have an inner v3code-main/ segment but live under outer apps/", () => {
    const diff = "apps/web/v3code-main/foo.ts\nv3code-main/apps/v3code-main/bar.ts";
    expect(findBlocked(diff)).toEqual(["apps/web/v3code-main/foo.ts"]);
  });
});
