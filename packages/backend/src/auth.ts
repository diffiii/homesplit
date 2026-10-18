import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { Id } from "@homesplit/contracts";
import { Logger } from "@nestjs/common";
import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { organization } from "better-auth/plugins";
import { db } from "./db";
// biome-ignore lint/performance/noNamespaceImport: drizzle schema bag for better-auth adapter
import * as schema from "./db/schema/auth";
import { seedDefaultCategories } from "./features/expense-categories/default-categories";
import { hasUnsettledBalances } from "./features/expenses/balances/balances.repository";

const frontendUrl = process.env.FRONTEND_URL;

if (!frontendUrl) {
  throw new Error("FRONTEND_URL is not set");
}

const logger = new Logger("Auth");

const previewOrigins = (process.env.FRONTEND_PREVIEW_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  // The browser reaches the API only through the frontend's `/api/*` rewrite,
  // so the frontend origin is Better Auth's public URL. Cookies carry no
  // `Domain`, use `SameSite=Lax`, and are `Secure` when this URL is https.
  baseURL: frontendUrl,
  trustedOrigins: [new URL(frontendUrl).origin, ...previewOrigins],
  advanced: {
    database: {
      generateId: "uuid",
    },
    // Better Auth skips the origin check under test unless this is explicit.
    disableOriginCheck: false,
    ipAddress: {
      // Vercel replaces this header with the visitor's address and forwards it
      // through the rewrite. Better Auth ignores it when it lists several hops.
      ipAddressHeaders: ["x-forwarded-for"],
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
    before: createAuthMiddleware(async (ctx) => {
      // Households are deleted only through DELETE /api/households/:householdId,
      // which checks and deletes in one transaction.
      if (ctx.path === "/organization/delete") {
        throw new APIError("NOT_FOUND", {
          code: "NOT_FOUND",
          message: "Not found",
        });
      }

      // Members settle up before they leave. `/organization/leave` calls no
      // organization hook, so the check runs here, before Better Auth's write
      // and outside its transaction: an expense committed in between can
      // still leave a departed member with a balance, as a removal can.
      if (ctx.path === "/organization/leave") {
        const organizationId: unknown = ctx.body?.organizationId;
        const householdId = Id.safeParse(organizationId);
        // Better Auth would pass any string to a `uuid` column and fail with
        // 500. It answers a missing ID or session itself.
        if (typeof organizationId === "string" && !householdId.success) {
          throw new APIError("BAD_REQUEST", {
            code: "VALIDATION_ERROR",
            message: "organizationId must be a UUID",
          });
        }
        const session = await getSessionFromCtx(ctx);
        if (
          session &&
          householdId.success &&
          (await hasUnsettledBalances(db, householdId.data, session.user.id))
        ) {
          throw new APIError("CONFLICT", {
            code: "UNSETTLED_BALANCE",
            message: "Settle up before leaving the household",
          });
        }
      }
    }),
  },
  plugins: [
    organization({
      organizationHooks: {
        // Runs after Better Auth has committed the household, outside any
        // transaction. Default categories are a convenience, so a failure
        // here is logged and the household is still created.
        afterCreateOrganization: async ({ organization: household }) => {
          try {
            await seedDefaultCategories(db, household.id);
          } catch (error) {
            logger.error(
              `Default categories not seeded for household ${household.id}`,
              error
            );
          }
        },
      },
    }),
  ],
});
