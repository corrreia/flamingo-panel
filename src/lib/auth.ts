// Password hashing using Web Crypto API (Workers-compatible)
// PBKDF2-SHA256 with 600k iterations (OWASP recommendation)

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    HASH_LENGTH * 8,
  );
  const saltHex = toHex(salt);
  const hashHex = toHex(new Uint8Array(hash));
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;

  const iterations = parseInt(parts[1]!, 10);
  const salt = fromHex(parts[2]!);
  const expectedHash = parts[3]!;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    HASH_LENGTH * 8,
  );
  return toHex(new Uint8Array(hash)) === expectedHash;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Session management (KV-backed)

export interface Session {
  userId: string;
  email: string;
  role: "admin" | "user";
  createdAt: number;
  expiresAt: number;
  refreshToken: string;
  ip: string;
  userAgent: string;
}

function generateToken(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return toHex(buf);
}

export const generateSessionId = () => generateToken(32);
export const generateRefreshToken = () => generateToken(48);

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const SESSION_PREFIX = "session:";

export async function createSession(
  kv: KVNamespace,
  userId: string,
  email: string,
  role: "admin" | "user",
  ip: string,
  userAgent: string,
): Promise<{ sessionId: string; refreshToken: string; expiresAt: number }> {
  const sessionId = generateSessionId();
  const refreshToken = generateRefreshToken();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL * 1000;

  const session: Session = {
    userId, email, role, createdAt: now, expiresAt,
    refreshToken, ip, userAgent,
  };

  await kv.put(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });

  // Track active sessions per user (for listing/revoking)
  const userSessions = JSON.parse(await kv.get(`user-sessions:${userId}`) || "[]") as string[];
  userSessions.push(sessionId);
  await kv.put(`user-sessions:${userId}`, JSON.stringify(userSessions), {
    expirationTtl: SESSION_TTL,
  });

  return { sessionId, refreshToken, expiresAt };
}

export async function getSession(kv: KVNamespace, sessionId: string): Promise<Session | null> {
  const data = await kv.get(`${SESSION_PREFIX}${sessionId}`);
  if (!data) return null;
  const session = JSON.parse(data) as Session;
  if (session.expiresAt < Date.now()) {
    await kv.delete(`${SESSION_PREFIX}${sessionId}`);
    return null;
  }
  return session;
}

export async function deleteSession(kv: KVNamespace, sessionId: string): Promise<void> {
  const session = await getSession(kv, sessionId);
  if (session) {
    const userSessions = JSON.parse(await kv.get(`user-sessions:${session.userId}`) || "[]") as string[];
    await kv.put(`user-sessions:${session.userId}`, JSON.stringify(userSessions.filter(s => s !== sessionId)));
  }
  await kv.delete(`${SESSION_PREFIX}${sessionId}`);
}

export async function refreshSession(
  kv: KVNamespace,
  sessionId: string,
  refreshToken: string,
): Promise<{ sessionId: string; refreshToken: string; expiresAt: number } | null> {
  const session = await getSession(kv, sessionId);
  if (!session || session.refreshToken !== refreshToken) return null;

  // Rotate: delete old session, create new one
  await deleteSession(kv, sessionId);
  return createSession(kv, session.userId, session.email, session.role, session.ip, session.userAgent);
}

export async function revokeAllUserSessions(kv: KVNamespace, userId: string): Promise<void> {
  const userSessions = JSON.parse(await kv.get(`user-sessions:${userId}`) || "[]") as string[];
  await Promise.all(userSessions.map(sid => kv.delete(`${SESSION_PREFIX}${sid}`)));
  await kv.delete(`user-sessions:${userId}`);
}
