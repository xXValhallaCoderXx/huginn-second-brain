import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
import { defineConfig } from "drizzle-kit";

// Load .env from the monorepo root (two levels up from packages/shared)
const rootEnv = resolve(process.cwd(), "../../.env");
const localEnv = resolve(process.cwd(), ".env");
config({ path: existsSync(rootEnv) ? rootEnv : localEnv });

export default defineConfig({
    schema: "./src/schema",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.APP_DATABASE_URL!,
    },
});
