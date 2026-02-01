import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,tsx,mts,cts}"],
    exclude: ["node_modules", "dist", "e2e"],
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
