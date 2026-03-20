/**
 * M2 Acceptance Test Script
 *
 * Tests the M2 acceptance criteria:
 * 1. Call agent with two different account IDs → different personality in responses
 * 2. Working memory persists per account
 *
 * Prerequisites:
 * - PostgreSQL running (docker compose up -d)
 * - Agent service running (pnpm --filter @huginn/agent dev)
 * - OPENROUTER_API_KEY set in .env
 *
 * Usage:
 *   cd apps/agent && npx tsx scripts/test-m2.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import {
    createDb,
    createPersonalityStore,
    ensureAccount,
    deleteAccount,
} from "@huginn/shared";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:4111";

// Fixed test UUIDs
const ACCOUNT_A = "00000000-0000-0000-0000-aaaaaaaaaaaa";
const ACCOUNT_B = "00000000-0000-0000-0000-bbbbbbbbbbbb";

const SOUL_A = `# SOUL — Communication Style

You are a formal, British-accented AI butler named Huginn.
- Always address the user as "Sir" or "Madam".
- Use eloquent, slightly old-fashioned English.
- Never use slang or contractions.
- Keep responses measured and dignified.`;

const SOUL_B = `# SOUL — Communication Style

You are a hyper-casual surfer-dude AI named Huginn.
- Use lots of slang like "dude", "totally", "gnarly", "stoked".
- Keep it super chill and laid-back.
- Use exclamation marks liberally!
- Throw in surfing/ocean metaphors wherever possible.`;

const IDENTITY_A = `# IDENTITY

- A distinguished professional who values precision and formality.
- Prefers structured, well-reasoned communication.`;

const IDENTITY_B = `# IDENTITY

- A laid-back creative who values vibes and spontaneity.
- Prefers casual, fun, and energetic communication.`;

interface ChatResponse {
    text: string;
    threadId: string;
}

async function chat(
    accountId: string,
    message: string,
    threadId?: string,
): Promise<ChatResponse> {
    const res = await fetch(`${AGENT_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, message, threadId }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Chat failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<ChatResponse>;
}

function separator(title: string) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${"=".repeat(60)}\n`);
}

async function seedTestData(db: ReturnType<typeof createDb>) {
    const store = createPersonalityStore(db);

    // Create test accounts (skips if already exist)
    await ensureAccount(db, ACCOUNT_A, "test-google-sub-a", "a@test.local", "Test User A");
    await ensureAccount(db, ACCOUNT_B, "test-google-sub-b", "b@test.local", "Test User B");

    // Seed personality files (skip if already seeded)
    const existsA = await store.exists(ACCOUNT_A);
    if (!existsA) {
        await store.save(ACCOUNT_A, "SOUL", SOUL_A, "Test seed — formal butler");
        await store.save(ACCOUNT_A, "IDENTITY", IDENTITY_A, "Test seed");
    }

    const existsB = await store.exists(ACCOUNT_B);
    if (!existsB) {
        await store.save(ACCOUNT_B, "SOUL", SOUL_B, "Test seed — surfer dude");
        await store.save(ACCOUNT_B, "IDENTITY", IDENTITY_B, "Test seed");
    }

    console.log("✓ Test accounts and personality files seeded");
}

async function cleanupTestData(db: ReturnType<typeof createDb>) {
    // Cascading delete: removing accounts also removes personality_files
    await deleteAccount(db, ACCOUNT_A);
    await deleteAccount(db, ACCOUNT_B);
    console.log("✓ Test data cleaned up");
}

async function main() {
    const db = createDb(process.env.APP_DATABASE_URL!);

    separator("Setup: Seeding test accounts with distinct personalities");
    await seedTestData(db);

    try {
        separator("Test 1: Personality Injection — Different accounts, same question");

        console.log(`Account A: ${ACCOUNT_A} (formal British butler)`);
        console.log(`Account B: ${ACCOUNT_B} (surfer dude)`);
        console.log(`Sending: "Introduce yourself briefly."\n`);

        const [responseA, responseB] = await Promise.all([
            chat(ACCOUNT_A, "Introduce yourself briefly."),
            chat(ACCOUNT_B, "Introduce yourself briefly."),
        ]);

        console.log(`--- Account A response (should be formal/British) ---`);
        console.log(responseA.text);
        console.log(`\n--- Account B response (should be casual/surfer) ---`);
        console.log(responseB.text);

        separator("Test 2: Working Memory — Persistence within a thread");

        console.log("Telling Account A about a deadline...\n");
        const memorySet = await chat(
            ACCOUNT_A,
            "I have a project deadline next Friday for the Huginn MVP launch. Please remember this.",
            responseA.threadId,
        );
        console.log(`Response: ${memorySet.text}\n`);

        console.log("Asking Account A about deadlines (same thread)...\n");
        const memoryRecall = await chat(
            ACCOUNT_A,
            "What deadlines do I have coming up?",
            responseA.threadId,
        );
        console.log(`Response: ${memoryRecall.text}`);

        separator("Test 3: Working Memory — Cross-thread persistence (same account)");

        console.log("Asking Account A about deadlines in a NEW thread...\n");
        const crossThread = await chat(
            ACCOUNT_A,
            "Do you remember any deadlines I mentioned?",
        );
        console.log(`Response: ${crossThread.text}`);

        separator("Test 4: Account Isolation — Account B should NOT know A's deadlines");

        console.log("Asking Account B about deadlines...\n");
        const isolation = await chat(
            ACCOUNT_B,
            "What deadlines do I have?",
        );
        console.log(`Response: ${isolation.text}`);

        separator("Results Summary");
        console.log("✓ Test 1: Check that A sounds like a butler, B sounds like a surfer");
        console.log("✓ Test 2: Check that Account A recalled the Friday deadline");
        console.log("✓ Test 3: Check that working memory persists across threads");
        console.log("✓ Test 4: Check that Account B does NOT mention Huginn MVP deadline");
        console.log("\n(Manual verification — inspect the responses above)");
    } finally {
        separator("Cleanup: Removing test data");
        await cleanupTestData(db);
    }
}

main().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
