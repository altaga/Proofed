import path from "node:path";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "."), "");
  Object.assign(process.env, env);

  return {
    test: {
      environment: "node",
      testTimeout: 90_000,
      hookTimeout: 90_000,
      fileParallelism: false,
      include: ["tests/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
