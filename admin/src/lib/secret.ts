import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function keyFromSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(s).digest();
}

/** Encrypt recoverable secret (Golden anketa password). */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string) {
  const [ver, ivB64, tagB64, dataB64] = payload.split(":");
  if (ver !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid secret payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFromSecret(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
