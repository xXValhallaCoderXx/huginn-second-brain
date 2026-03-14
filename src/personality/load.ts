import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const soul = readFileSync(join(__dirname, "SOUL.md"), "utf-8");
const identity = readFileSync(join(__dirname, "IDENTITY.md"), "utf-8");
const memory = readFileSync(join(__dirname, "MEMORY.md"), "utf-8");

export const personality = [soul, identity, memory].join("\n\n---\n\n");
