import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { db } from "./db";
// biome-ignore lint/performance/noNamespaceImport: drizzle schema bag for better-auth adapter
import * as schema from "./db/schema/auth";

export const auth = betterAuth({
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    // Households are deleted only through DELETE /api/households/:householdId,
    // which checks and deletes in one transaction.
    before: createAuthMiddleware((ctx) => {
      if (ctx.path === "/organization/delete") {
        throw new APIError("NOT_FOUND", {
          code: "NOT_FOUND",
          message: "Not found",
        });
      }
      return Promise.resolve();
    }),
  },
  plugins: [organization()],
});
