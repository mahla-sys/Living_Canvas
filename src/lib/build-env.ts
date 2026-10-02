import { loadEnv } from "vite";

export type BuildEnvironment = Record<string, string | undefined>;

/** Map private build-time environment names to the browser-facing keys read by the app. */
export function buildProviderDefines(env: BuildEnvironment): Record<string, string> {
  return {
    "import.meta.env.VITE_GEMINI_API_KEY": JSON.stringify(String(env.GEMINI_API_KEY ?? "").trim()),
    "import.meta.env.VITE_MISTRAL_API_KEY": JSON.stringify(String(env.MISTRAL_API_KEY ?? "").trim()),
  };
}

/** Load dotenv files first, then let the invoking shell/CI environment take precedence. */
export function loadProviderDefines(
  mode: string,
  envDir: string,
  shellEnvironment: BuildEnvironment,
): Record<string, string> {
  return buildProviderDefines({ ...loadEnv(mode, envDir, ""), ...shellEnvironment });
}
