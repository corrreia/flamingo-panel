import type { Database } from "../db";
import { schema } from "../db";

/** Generate a papp_ API key, hash it, insert the record, and return the raw token + identifier. */
export async function generateApiKey(
  db: Database,
  userId: string,
  memo: string
): Promise<{ token: string; identifier: string }> {
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 43);
  const token = `papp_${rawToken}`;

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const identifier = `flam_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  await db.insert(schema.apiKeys).values({
    userId,
    identifier,
    tokenHash,
    memo,
  });

  return { token, identifier };
}
