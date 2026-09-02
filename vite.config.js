import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // main bundle is ~530KB (React Flow). vendor splitting is in the Backlog;
    // this ceiling only exists so a permanent warning does not drown real warnings.
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    // allow any host so the sandbox/network preview works (dev mode only)
    allowedHosts: true,
    hmr: {
      port: 3000,
    },
  },
});
