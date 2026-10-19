import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.spec.ts"],
    // A zone west of UTC with DST, so date helpers can't pass by accident in UTC.
    env: { TZ: "America/New_York" },
  },
});
