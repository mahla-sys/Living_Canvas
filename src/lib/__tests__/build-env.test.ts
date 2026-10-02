// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProviderDefines } from "../build-env";

const GEMINI_DEFINE = "import.meta.env.VITE_GEMINI_API_KEY";
const MISTRAL_DEFINE = "import.meta.env.VITE_MISTRAL_API_KEY";

function withoutProviderEnvironment<T>(run: () => T): T {
  const previous = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  };
  delete process.env.GEMINI_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  try {
    return run();
  } finally {
    if (previous.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous.GEMINI_API_KEY;
    if (previous.MISTRAL_API_KEY === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = previous.MISTRAL_API_KEY;
  }
}

describe("build-time provider environment", () => {
  it("loads local dotenv values and lets shell values override them", () => {
    const envDir = mkdtempSync(join(tmpdir(), "living-canvas-env-"));
    try {
      writeFileSync(join(envDir, ".env"), "GEMINI_API_KEY=local-gemini\nMISTRAL_API_KEY=local-mistral\n");
      const defines = withoutProviderEnvironment(() =>
        loadProviderDefines("development", envDir, { MISTRAL_API_KEY: "ci-mistral" }),
      );

      expect(defines[GEMINI_DEFINE]).toBe(JSON.stringify("local-gemini"));
      expect(defines[MISTRAL_DEFINE]).toBe(JSON.stringify("ci-mistral"));
    } finally {
      rmSync(envDir, { recursive: true, force: true });
    }
  });

  it("does not invent a key when no environment value is configured", () => {
    const envDir = mkdtempSync(join(tmpdir(), "living-canvas-env-"));
    try {
      const defines = withoutProviderEnvironment(() => loadProviderDefines("development", envDir, {}));
      expect(defines[GEMINI_DEFINE]).toBe(JSON.stringify(""));
      expect(defines[MISTRAL_DEFINE]).toBe(JSON.stringify(""));
    } finally {
      rmSync(envDir, { recursive: true, force: true });
    }
  });
});
