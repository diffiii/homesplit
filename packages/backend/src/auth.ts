import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { AvatarUrl, DisplayName, Id } from "@homesplit/contracts";
import { Logger } from "@nestjs/common";
import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { organization } from "better-auth/plugins";
import { z } from "zod";
import { db } from "./db";
// biome-ignore lint/performance/noNamespaceImport: drizzle schema bag for better-auth adapter
import * as schema from "./db/schema";
import { seedDefaultCategories } from "./features/expense-categories/default-categories";
import { hasUnsettledBalances } from "./features/expenses/balances/balances.repository";
import { sendEmail } from "./mail";

const frontendUrl = process.env.FRONTEND_URL;

const isE2E = process.env.PORT === "8180" || process.env.IS_E2E === "true";

if (!frontendUrl) {
  throw new Error("FRONTEND_URL is not set");
}

const logger = new Logger("Auth");

const previewOrigins = (process.env.FRONTEND_PREVIEW_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const NewUserProfile = z.object({
  name: DisplayName,
  image: AvatarUrl.nullish(),
});

export const auth = betterAuth({
  baseURL: frontendUrl,
  trustedOrigins: [new URL(frontendUrl).origin, ...previewOrigins],
  advanced: {
    database: {
      generateId: "uuid",
    },
    disableOriginCheck: false,
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        before: (user) => {
          const result = NewUserProfile.safeParse(user);
          if (!result.success) {
            const issues = result.error.issues.map(({ path, message }) => ({
              path,
              message,
            }));
            throw new APIError("BAD_REQUEST", {
              code: "VALIDATION_ERROR",
              message: "Invalid request",
              details: { issues },
            });
          }

          return Promise.resolve({
            data: {
              ...user,
              name: result.data.name,
              ...(isE2E ? { emailVerified: true } : {}),
            },
          });
        },
      },
    },
  },

  disabledPaths: ["/update-user"],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !isE2E,
  },
  ...(isE2E
    ? {}
    : {
        emailVerification: {
          sendOnSignIn: true,
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          expiresIn: 86_400,
          sendVerificationEmail: async ({ user, url }) => {
            try {
              await sendEmail({
                to: user.email,
                subject: "Verify your email address",
                html: `
                  <p>Please verify your email address by clicking
                  <a href="${url}">Verify email</a>.</p>
                `,
              });
            } catch (error) {
              logger.error(
                `Verification email not sent to user ${user.id}`,
                error
              );
            }
          },
        },
      }),
  session: {
    freshAge: 0,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/organization/delete") {
        throw new APIError("NOT_FOUND", {
          code: "NOT_FOUND",
          message: "Not found",
        });
      }

      if (ctx.path === "/organization/leave") {
        const organizationId: unknown = ctx.body?.organizationId;
        const householdId = Id.safeParse(organizationId);

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
