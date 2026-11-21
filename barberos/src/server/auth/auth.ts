import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db/client";
import { accounts, rateLimits, sessions, users, verifications } from "@/server/db/schema";
import { env } from "@/server/env";
import { uuidv7 } from "@/lib/ids";
import { sendEmail } from "@/server/notifications/mailer";

export const auth = betterAuth({
  appName: "BarberOS",
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  // In GitHub Codespaces the app is reached through a forwarded https address and
  // internally on localhost. Trust both, but only there.
  trustedOrigins: process.env.CODESPACES === "true" ? [env().BETTER_AUTH_URL, "http://localhost:3000"] : [],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      rateLimit: rateLimits,
    },
  }),
  advanced: {
    database: { generateId: () => uuidv7() },
    cookiePrefix: "barberos",
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days: barbers stay signed in on their phones
    updateAge: 60 * 60 * 24,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your BarberOS password",
        text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your BarberOS password.\nUse this link within one hour:\n\n${url}\n\nIf this wasn't you, ignore this email. Your password stays the same.`,
      });
    },
  },
  rateLimit: {
    enabled: process.env.DISABLE_RATE_LIMIT !== "1",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
