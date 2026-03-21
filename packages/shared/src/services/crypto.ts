import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
    const hex = process.env.CALENDAR_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(
            "CALENDAR_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). " +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        );
    }
    return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns `iv:tag:ciphertext` (all base64).
 */
export function encryptToken(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
        iv.toString("base64"),
        tag.toString("base64"),
        encrypted.toString("base64"),
    ].join(":");
}

/**
 * Decrypt an `iv:tag:ciphertext` string produced by `encryptToken`.
 */
export function decryptToken(encrypted: string): string {
    const key = getKey();
    const parts = encrypted.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted token format (expected iv:tag:ciphertext)");
    }

    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const ciphertext = Buffer.from(parts[2], "base64");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}
