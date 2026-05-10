import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxyTarget = process.env.FASTIFLY_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@ui": new URL("./src/components/ui", import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: apiProxyTarget,
      },
      "/health": {
        changeOrigin: true,
        target: apiProxyTarget,
      },
    },
  },
});
