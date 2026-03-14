import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (
      existsSync(join(dir, "package.json")) &&
      existsSync(join(dir, "personality"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const projectRoot = findProjectRoot(process.cwd());
const personalityDir = join(projectRoot, "personality");

const soul = readFileSync(join(personalityDir, "SOUL.md"), "utf-8");
const identity = readFileSync(join(personalityDir, "IDENTITY.md"), "utf-8");
const memory = readFileSync(join(personalityDir, "MEMORY.md"), "utf-8");

export const personality = [soul, identity, memory].join("\n\n---\n\n");
