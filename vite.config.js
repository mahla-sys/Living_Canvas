import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // باندل اصلی ~530KB است (React Flow). split شدن vendor در Backlog است؛
    // این سقف فقط برای آن است که warningِ همیشگی، هشدار واقعی را نپوشاند.
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    // برای پیش‌نمایش در محیط سندباکس/شبکه: هر host را بپذیرد (فقط حالت dev)
    allowedHosts: true,
    hmr: {
      port: 3000,
    },
  },
});
