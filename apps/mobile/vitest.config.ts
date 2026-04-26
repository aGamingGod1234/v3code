import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [
      "**/.claude/**",
      "**/.docs/**",
      "**/.git/**",
      "**/.plans/**",
      "**/.turbo/**",
      "**/node_modules/**",
    ],
  },
});
