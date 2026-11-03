import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: "postgres://postgres:postgres@localhost:54329/agender_test" },
    // Os testes de integração compartilham um banco; rodar arquivos em série evita interferência.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
