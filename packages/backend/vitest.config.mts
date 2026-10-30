import path from "node:path";
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

const srcAlias = {
  "@": path.resolve(import.meta.dirname, "src"),
};

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        plugins: [swc.vite({ module: { type: "es6" } })],
        resolve: { alias: srcAlias },
        test: {
          name: "unit",
          include: ["src/**/*.spec.ts"],
        },
      },
      {
        plugins: [swc.vite({ module: { type: "es6" } })],
        resolve: { alias: srcAlias },
        test: {
          name: "integration",
          include: ["test/**/*.test.ts"],
          env: {
            DATABASE_URL: databaseUrl,
            BETTER_AUTH_SECRET: "test-secret-not-for-production-use-0123456789",
            FRONTEND_URL: "https://homesplit.test",
            FRONTEND_PREVIEW_ORIGINS: "https://homesplit-web-*.vercel.app",
            STORAGE_DRIVER: "memory",
            ATTACHMENT_MAX_BYTES: "65536",
            ATTACHMENT_MAX_PER_EXPENSE: "2",
            AVATAR_MAX_BYTES: "65536",
          },
          globalSetup: ["test/global-setup.ts"],
          setupFiles: ["test/setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
