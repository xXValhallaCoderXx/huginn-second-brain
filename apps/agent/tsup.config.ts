import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: "esm",
    target: "node22",
    outDir: "dist",
    clean: true,
    // Keep all dependencies external — resolved from node_modules at runtime
    noExternal: [],
});
