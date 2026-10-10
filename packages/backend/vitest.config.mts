import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/homesplit_test";

if (!new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error(
    `Refusing to run tests against ${databaseUrl}: database name must end in _test`
  );
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        plugins: [swc.vite({ module: { type: "es6" } })],
        test: {
          name: "unit",
          include: ["src/**/*.spec.ts"],
        },
      },
      {
        plugins: [swc.vite({ module: { type: "es6" } })],
        test: {
          name: "integration",
          include: ["test/**/*.test.ts"],
          env: {
            DATABASE_URL: databaseUrl,
            BETTER_AUTH_SECRET: "test-secret-not-for-production-use-0123456789",
            BETTER_AUTH_URL: "http://localhost:8080",
          },
          globalSetup: ["test/global-setup.ts"],
          setupFiles: ["test/setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
