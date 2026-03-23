if (!process.env.RAILWAY_ENVIRONMENT) {
    const { config } = await import("dotenv");
    const { resolve } = await import("node:path");
    config({ path: resolve(import.meta.dirname, "../../../.env") });
}
