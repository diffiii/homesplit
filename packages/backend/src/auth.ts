import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { db } from "./db";
// biome-ignore lint/performance/noNamespaceImport: drizzle schema bag for better-auth adapter
import * as schema from "./db/schema";

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
  plugins: [organization()],
});
