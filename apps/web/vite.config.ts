import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxyTarget = process.env.FASTIFLY_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
