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
import * as schema from "./db/schema/auth";
import { emailLink, VERIFY_EMAIL_PATH } from "./email-links";
import { seedDefaultCategories } from "./features/expense-categories/default-categories";
import { hasUnsettledBalances } from "./features/expenses/balances/balances.repository";
import {
  assertInvitationAllowed,
  INVITATION,
  invitationEmail,
  invitationLink,
} from "./household-invitations";
import { createMailer, type Email, loadMailConfig } from "./mail";
import {
  assertResetRequestAllowed,
  isPasswordResetRequest,
  mayEmailResetLink,
  PASSWORD_RESET,
  passwordResetEmail,
  resetLink,
  VISITOR_IP_HEADER,
} from "./password-reset";

const frontendUrl = process.env.FRONTEND_URL;

if (!frontendUrl) {
  throw new Error("FRONTEND_URL is not set");
}

const mailConfig = loadMailConfig();

/** The app's mailer. Better Auth is configured outside Nest, so it's not a provider. */
export const mailer = createMailer(mailConfig);

// The web end-to-end tests sign up through the UI and can't read the emailed
// link, so they turn verification off. It needs the log driver, so it can't
// reach a deployment that sends real mail.
const skipEmailVerification =
  process.env.AUTH_SKIP_EMAIL_VERIFICATION === "true";

if (skipEmailVerification && mailConfig.driver !== "log") {
  throw new Error("AUTH_SKIP_EMAIL_VERIFICATION needs MAIL_DRIVER=log");
}

const VERIFICATION_LINK_TTL_SECONDS = 24 * 60 * 60;

const logger = new Logger("Auth");

/**
 * Sends an email without making the caller wait for the provider, and logs a
 * failure instead of throwing it.
 */
function sendInBackground(build: () => Email, failure: string): void {
  try {
    mailer.send(build()).catch((error: unknown) => {
      logger.error(failure, error);
    });
  } catch (error) {
    logger.error(failure, error);
  }
}

const previewOrigins = (process.env.FRONTEND_PREVIEW_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const NewUserProfile = z.object({
  name: DisplayName,
  image: AvatarUrl.nullish(),
});

/** The trimmed name, or 400 `VALIDATION_ERROR` with the issues. */
function parseNewUserName(input: unknown): string {
  const result = NewUserProfile.safeParse(input);
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
  return result.data.name;
}

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
      ipAddressHeaders: [VISITOR_IP_HEADER],
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        before: (user) =>
          Promise.resolve({
            data: {
              ...user,
              name: parseNewUserName(user),
              ...(skipEmailVerification ? { emailVerified: true } : {}),
            },
          }),
      },
    },
  },
  // Profiles change only through PATCH /api/me, which validates `imageUrl`.
  disabledPaths: ["/update-user"],
  emailAndPassword: {
    enabled: true,
    // Sign-up then sends the verification email and answers without a
    // session, and sign-in answers 403 `EMAIL_NOT_VERIFIED` until the link
    // is opened; see "Better Auth endpoints" in docs/decisions.md.
    requireEmailVerification: !skipEmailVerification,
    resetPasswordTokenExpiresIn: PASSWORD_RESET.linkTtlSeconds,
    // A reset signs nobody in, so this ends every session of the user.
    revokeSessionsOnPasswordReset: true,
    // The answer to a reset request must not depend on whether the email has
    // an account, and a send takes far longer than the path for an unknown
    // email, so the answer doesn't wait for it. A send that fails, or that the
    // per-email limit holds back, is logged and the answer stays the same.
    sendResetPassword: ({ user, url, token }) => {
      if (mayEmailResetLink(user.email)) {
        sendInBackground(
          () =>
            passwordResetEmail(user.email, resetLink(frontendUrl, token, url)),
          `Password reset email not sent to user ${user.id}`
        );
      } else {
        logger.warn(`Password reset email held back for user ${user.id}`);
      }
      return Promise.resolve();
    },
  },
  emailVerification: {
    // A link that expired or never arrived is replaced on the next sign-in.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: VERIFICATION_LINK_TTL_SECONDS,
    // The link opens the frontend's `/verify-email` page, which verifies the
    // token, rather than Better Auth's `url`, which a mail scanner opening it
    // would act on (docs/decisions.md, "Email links"). `URL` encodes it, so
    // it's safe to put in HTML as is.
    sendVerificationEmail: async ({ user, url: authUrl, token }) => {
      const url = emailLink(frontendUrl, VERIFY_EMAIL_PATH, token, authUrl);
      // The user row exists by now. A failed send is logged rather than
      // thrown, so sign-up still succeeds and the next sign-in sends again.
      try {
        await mailer.send({
          to: user.email,
          subject: "Verify your email for HomeSplit",
          text: `Open this link to verify your email and finish signing up for HomeSplit:\n\n${url}\n\nThe link works for 24 hours. If you didn't sign up, ignore this email.`,
          html: `<p>Open this link to verify your email and finish signing up for HomeSplit:</p><p><a href="${url}">Verify my email</a></p><p>The link works for 24 hours. If you didn't sign up, ignore this email.</p>`,
        });
      } catch (error) {
        logger.error(`Verification email not sent to user ${user.id}`, error);
      }
    },
  },
  session: {
    // `/list-sessions` would otherwise answer 403 `SESSION_NOT_FRESH` to
    // anyone who signed in more than a day ago. Besides it, only
    // `/unlink-account` (no social sign-in) and `/delete-user` (disabled)
    // check freshness; see "Signed-in devices" in docs/decisions.md.
    freshAge: 0,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // A sign-up for a taken email answers like a new one but skips
      // `user.create.before`, so the profile is checked here too. Otherwise a
      // bad name would answer 400 for a new email and 200 for a taken one.
      if (ctx.path === "/sign-up/email") {
        return {
          context: { body: { ...ctx.body, name: parseNewUserName(ctx.body) } },
        };
      }

      // The answer to a reset request doesn't depend on the email, so the only
      // limit that can answer differently is the visitor's address.
      if (isPasswordResetRequest(ctx.path)) {
        assertResetRequestAllowed(ctx.headers);
      }

      // Households are deleted only through DELETE /api/households/:householdId,
      // which checks and deletes in one transaction.
      if (ctx.path === "/organization/delete") {
        throw new APIError("NOT_FOUND", {
          code: "NOT_FOUND",
          message: "Not found",
        });
      }

      // Every invitation email, new or sent again, goes through this endpoint,
      // so the limits on who may send and who may be sent to are checked here,
      // before Better Auth writes anything.
      if (ctx.path === "/organization/invite-member") {
        const session = await getSessionFromCtx(ctx);
        assertInvitationAllowed(session?.user.id, ctx.body?.email);
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
      invitationExpiresIn: INVITATION.expiresInSeconds,
      // Inviting an address that already has a pending invitation cancels the
      // earlier one, so only the newest link works. Better Auth cancels only
      // the first one it finds and concurrent invitations don't see each
      // other, so the `invitation_single_pending` trigger enforces the rule
      // in the database. `resend: true` on `invite-member` sends the same
      // invitation again instead.
      cancelPendingInvitationsOnReInvite: true,
      // The invitation row exists by now. A failed send is logged rather than
      // thrown, so the invitation stays in `list-invitations` and the inviter
      // can send it again; see "Better Auth endpoints" in docs/decisions.md.
      sendInvitationEmail: async ({
        id,
        email,
        organization: household,
        inviter,
      }) => {
        try {
          await mailer.send(
            invitationEmail({
              to: email,
              household: household.name,
              inviter: inviter.user.name,
              link: invitationLink(frontendUrl, id),
            })
          );
        } catch (error) {
          logger.error(`Invitation email not sent for invitation ${id}`, error);
        }
      },
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
