import { defineEventHandler, getQuery, redirect } from "h3";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../../.env"), quiet: true });

import { createDb, createCalendarConnectionService } from "@huginn/shared";
import { verifyState } from "../../../src/lib/server-fns";

const db = createDb(process.env.DATABASE_URL!);

export default defineEventHandler(async (event) => {
    const query = getQuery(event) as Record<string, string>;
    const { code, state, error: oauthError } = query;

    if (oauthError) {
        return redirect("/calendars?error=oauth_denied", 302);
    }

    if (!code || !state) {
        return redirect("/calendars?error=missing_params", 302);
    }

    // Validate CSRF state
    const stateData = await verifyState(state);
    if (!stateData) {
        return redirect("/calendars?error=invalid_state", 302);
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: `${process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3000")}/api/calendar/callback`,
            grant_type: "authorization_code",
        }),
    });

    if (!tokenRes.ok) {
        console.error("[calendar/callback] Token exchange failed:", await tokenRes.text());
        return redirect("/calendars?error=token_exchange", 302);
    }

    const tokens = (await tokenRes.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
    };

    if (!tokens.refresh_token) {
        console.error("[calendar/callback] No refresh_token received — user may need to re-consent");
        return redirect("/calendars?error=no_refresh_token", 302);
    }

    // Fetch the user's email for this Google account
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoRes.ok) {
        console.error("[calendar/callback] Userinfo fetch failed:", await userinfoRes.text());
        return redirect("/calendars?error=userinfo_failed", 302);
    }

    const userinfo = (await userinfoRes.json()) as { email: string };

    // Store the connection
    const svc = createCalendarConnectionService(db);
    await svc.createConnection({
        accountId: stateData.accountId,
        provider: "google",
        providerEmail: userinfo.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: tokens.scope,
    });

    return redirect("/calendars?connected=true", 302);
});
