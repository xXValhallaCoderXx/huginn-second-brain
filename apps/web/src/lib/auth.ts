import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { user, session, authAccount, verification } from "@huginn/shared";

export const auth = betterAuth({
    baseURL: process.env.APP_URL || "http://localhost:3000",
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
