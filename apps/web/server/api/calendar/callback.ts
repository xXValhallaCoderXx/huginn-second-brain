import { defineEventHandler, getQuery, sendRedirect } from "h3";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../../.env"), quiet: true });

import { createDb, createCalendarConnectionService } from "@huginn/shared";
import { verifyState } from "../../../src/lib/server-fns";

const db = createDb(process.env.APP_DATABASE_URL!);

export default defineEventHandler(async (event) => {
    const query = getQuery(event) as Record<string, string>;
    const { code, state, error: oauthError } = query;

    if (oauthError) {
        return sendRedirect(event, "/calendars?error=oauth_denied");
    }

    if (!code || !state) {
        return sendRedirect(event, "/calendars?error=missing_params");
    }

    // Validate CSRF state
    const stateData = await verifyState(state);
    if (!stateData) {
        return sendRedirect(event, "/calendars?error=invalid_state");
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: `${process.env.APP_URL}/api/calendar/callback`,
            grant_type: "authorization_code",
        }),
    });

    if (!tokenRes.ok) {
        console.error("[calendar/callback] Token exchange failed:", await tokenRes.text());
        return sendRedirect(event, "/calendars?error=token_exchange");
    }

    const tokens = (await tokenRes.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
    };

    if (!tokens.refresh_token) {
        console.error("[calendar/callback] No refresh_token received — user may need to re-consent");
        return sendRedirect(event, "/calendars?error=no_refresh_token");
    }

    // Fetch the user's email for this Google account
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoRes.ok) {
        console.error("[calendar/callback] Userinfo fetch failed:", await userinfoRes.text());
        return sendRedirect(event, "/calendars?error=userinfo_failed");
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

    return sendRedirect(event, "/calendars?connected=true");
});
