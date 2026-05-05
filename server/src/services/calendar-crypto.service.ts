import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_IV_BYTES = 12;

function readEncryptionKey(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (!raw) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY is not configured");
  }

  // Supports either base64-encoded 32 bytes or 64-char hex strings.
  const isHex = /^[0-9a-fA-F]{64}$/.test(raw);
  const decoded = isHex ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");

  if (decoded.length !== 32) {
    throw new Error(
      "CALENDAR_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (AES-256 key)",
    );
  }

  return decoded;
}

export const CalendarCryptoService = {
  encrypt(plainText: string): string {
    const key = readEncryptionKey();
    const iv = randomBytes(ENCRYPTION_IV_BYTES);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${authTag.toString("base64url")}`;
  },

  decrypt(serialized: string): string {
    const [ivPart, encryptedPart, tagPart] = serialized.split(".");
    if (!ivPart || !encryptedPart || !tagPart) {
      throw new Error("Invalid encrypted token payload format");
    }

    const key = readEncryptionKey();
    const iv = Buffer.from(ivPart, "base64url");
    const encrypted = Buffer.from(encryptedPart, "base64url");
    const authTag = Buffer.from(tagPart, "base64url");

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  },

  hashFeedToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  },

  generateOpaqueToken(byteLength = 32): string {
    return randomBytes(byteLength).toString("hex");
  },
};
