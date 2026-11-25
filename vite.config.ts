import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The app was written against TanStack Router; a hosted page routes on the URL hash instead.
      "@tanstack/react-router": path.resolve(__dirname, "src/router.tsx"),
    },
  },
  build: { chunkSizeWarningLimit: 5000 },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
} as never);
