import { defineEventHandler } from "h3";
import { auth } from "~/lib/auth";

export default defineEventHandler((event) => {
    return auth.handler(event.req as Request);
});
