import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { db } from "./db";
// biome-ignore lint/performance/noNamespaceImport: drizzle schema bag for better-auth adapter
import * as schema from "./db/schema";

import { sendEmail } from "./mail";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

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
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({
      user,
      token,
    }: {
      user: { email: string };
      token: string;
    }) => {
      const verificationUrl = `${FRONTEND_URL}/verify-email?token=${token}`;

      await sendEmail({
        to: user.email,
        subject: "Verify your email address",
        html: `<p>Please verify your email by clicking <a href="${verificationUrl}">${verificationUrl}</a>.</p>`,
      });
    },
  },
  plugins: [organization()],
});
