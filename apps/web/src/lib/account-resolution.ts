import {
    createAccountService,
    createPersonalityStore,
    getGoogleSubForBaUser,
    seedNewAccount,
    type Database,
    type Account,
} from "@huginn/shared";
import type { Session } from "./auth";

/**
 * Resolves a Better Auth session to a Huginn account.
 *
 * Flow:
 * 1. Query BA's `account` table for the Google OAuth entry → get `accountId` (= Google sub)
 * 2. Look up our `accounts` table by `googleSub`
 * 3. If not found → create account + seed default personality files
 * 4. Return the Huginn Account
 */
export async function resolveAccount(
    db: Database,
    baSession: Session,
): Promise<Account> {
    const accountSvc = createAccountService(db);
    const personalityStore = createPersonalityStore(db);

    // 1. Get Google sub from Better Auth's OAuth account table
    const googleSub = await getGoogleSubForBaUser(db, baSession.user.id);

    if (!googleSub) {
        throw new Error("No Google OAuth account found for this session");
    }

    // 2. Look up our account
    let account = await accountSvc.getAccountByGoogleSub(googleSub);

    // 3. Create if missing
    if (!account) {
        account = await accountSvc.createAccount(
            googleSub,
            baSession.user.email,
            baSession.user.name,
        );
        await seedNewAccount(personalityStore, account.id);
    }

    return account;
}
