// Server-only at-rest encryption for merchant-supplied secrets (e.g. the
// per-space Paystack secret key). AES-256-GCM with a deployment-level key
// from SECRETS_ENCRYPTION_KEY. Blob format: "v1:<iv>:<authTag>:<ciphertext>"
// (base64 segments), so the scheme can be rotated later.
import crypto from "crypto";

const VERSION = "v1";

function getEncryptionKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SECRETS_ENCRYPTION_KEY is not configured");
  }
  // Derive a fixed 32-byte key from whatever string is provided, so the env
  // value doesn't have to be exactly 32 bytes of base64/hex.
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/** Returns null when the blob is empty, malformed, or fails authentication. */
export function decryptSecret(blob: string): string | null {
  if (!blob) return null;
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Failed to decrypt secret:", error);
    return null;
  }
}
