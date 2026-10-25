/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        // Vendor code in separate, long-cacheable chunks.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          mantine: ["@mantine/core", "@mantine/hooks", "@mantine/dates", "@mantine/notifications", "@mantine/modals", "dayjs"],
          charts: ["recharts", "@mantine/charts"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    css: false,
  },
});
