import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
    server: {
        port: 3000,
    },
    resolve: {
        alias: {
            "~": resolve(import.meta.dirname, "src"),
        },
    },
    plugins: [
        tailwindcss(),
        tanstackStart(),
        viteReact(),
        nitro({ serverDir: true }),
    ],
});
