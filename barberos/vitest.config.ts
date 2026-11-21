import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DB_APP = process.env.TEST_DATABASE_URL ?? "postgres://barberos_web:barberos_web@localhost:5432/barberos_test";
const TEST_DB_OWNER =
  process.env.TEST_MIGRATION_DATABASE_URL ?? "postgres://barberos_owner:barberos_owner@localhost:5432/barberos_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          env: {
            DATABASE_URL: TEST_DB_APP,
            TEST_MIGRATION_DATABASE_URL: TEST_DB_OWNER,
            BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
            BETTER_AUTH_URL: "http://localhost:3000",
          },
        },
      },
    ],
  },
});
