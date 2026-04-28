import * as path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@t3tools\/contracts$/,
        replacement: path.resolve(import.meta.dirname, "./packages/contracts/src/index.ts"),
      },
    ],
  },
  test: {
    exclude: [
      // vitest's `exclude` replaces its defaults instead of merging, so the
      // repo-wide ignores (node_modules, dist, build, coverage) need to be
      // listed explicitly here. Without this the server suite picks up
      // tests from the symlinked @v3tools/web workspace package and fails
      // to resolve its `~/` path alias.
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.claude/**",
      "**/.docs/**",
      "**/.git/**",
      "**/.plans/**",
      "**/.turbo/**",
    ],
  },
});
