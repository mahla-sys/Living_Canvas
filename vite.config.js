import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /* Measured before this change: one 538 kB chunk (166 kB gzip) that had to download, parse and
       evaluate before React could mount anything — and boot itself is not the cost. `boot.test.ts`
       measures a warm boot at ~4 ms over 12 storage operations, and a cold boot whose ~880 ms is
       `sleep(46)` pacing the boot overlay one file at a time, not I/O. So "the first load is slow"
       was never about reading files; it was about parsing a bundle that changes shape on every deploy
       and therefore re-downloads in full on every deploy.

       Splitting the vendor code out fixes the half that is fixable: React and React Flow barely change,
       so a returning reader re-downloads only the app chunk. This does not make the *first ever* visit
       faster — the same bytes still arrive — and it is not a feature, it is a cache boundary. */
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@xyflow") || id.includes("reactflow")) return "vendor-flow";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "vendor-react";
          return "vendor";
        },
      },
    },
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
