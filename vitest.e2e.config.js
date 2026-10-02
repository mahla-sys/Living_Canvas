import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/lib/__tests__/viewport-playwright.test.ts"],
    exclude: [],
    environment: "node",
    testTimeout: 20_000,
  },
});
