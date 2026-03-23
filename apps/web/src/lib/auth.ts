import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { user, session, authAccount, verification } from "@huginn/shared";

const appUrl =
    process.env.APP_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : "http://localhost:3000");

export const auth = betterAuth({
    baseURL: appUrl,
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: { user, session, account: authAccount, verification },
    }),
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
    },
});

export type Session = typeof auth.$Infer.Session;
