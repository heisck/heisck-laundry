import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { AppError } from "@/lib/app-error";
import { getDb, withDbConnectionRetry } from "@/lib/db";

export const PRIVATE_ACCESS_COOKIE_NAME = "heisck_private_access";
export const PRIVATE_ACCESS_COOKIE_PATH = "/";

interface PrivateAccessSettingsCacheEntry {
  cachedAt: string;
  passwordHash: string;
}

interface PrivateAccessAttemptCacheEntry {
  firstAttemptAtMs: number;
  failedCount: number;
  lockedUntilMs: number | null;
}

declare global {
  var __privateAccessSettingsCache: PrivateAccessSettingsCacheEntry | undefined;
  var __privateAccessAttemptCache:
    | Map<string, PrivateAccessAttemptCacheEntry>
    | undefined;
}

const PRIVATE_ACCESS_SETTINGS_CACHE_TTL_MS = 30000;
const PASSWORD_HASH_PREFIX = "scrypt";
const PRIVATE_ACCESS_MAX_FAILED_ATTEMPTS = 5;
const PRIVATE_ACCESS_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const PRIVATE_ACCESS_LOCKOUT_MS = 15 * 60 * 1000;

function setCachedPrivateAccessPasswordHash(passwordHash: string) {
  globalThis.__privateAccessSettingsCache = {
    cachedAt: new Date().toISOString(),
    passwordHash,
  };
}

function getCachedPrivateAccessPasswordHash(): string | null {
  const cached = globalThis.__privateAccessSettingsCache;
  if (!cached) {
    return null;
  }

  const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
  if (ageMs > PRIVATE_ACCESS_SETTINGS_CACHE_TTL_MS) {
    globalThis.__privateAccessSettingsCache = undefined;
    return null;
  }

  return cached.passwordHash;
}

function getPrivateAccessAttemptCache(): Map<string, PrivateAccessAttemptCacheEntry> {
  if (!globalThis.__privateAccessAttemptCache) {
    globalThis.__privateAccessAttemptCache = new Map();
  }

  return globalThis.__privateAccessAttemptCache;
}

function clearStalePrivateAccessAttempt(
  actorKey: string,
  nowMs: number,
): PrivateAccessAttemptCacheEntry | null {
  const entry = getPrivateAccessAttemptCache().get(actorKey);
  if (!entry) {
    return null;
  }

  const lockExpired =
    entry.lockedUntilMs !== null && entry.lockedUntilMs <= nowMs;
  const windowExpired = nowMs - entry.firstAttemptAtMs > PRIVATE_ACCESS_ATTEMPT_WINDOW_MS;

  if (lockExpired || windowExpired) {
    getPrivateAccessAttemptCache().delete(actorKey);
    return null;
  }

  return entry;
}

function createPrivateAccessCookieValueFromHash(
  passwordHash: string,
  userId: string,
): string {
  return createHash("sha256")
    .update(`private-access:${userId}:${passwordHash}`)
    .digest("hex");
}

function parsePasswordHash(passwordHash: string): {
  salt: string;
  derivedKey: string;
} {
  const [prefix, salt, derivedKey] = passwordHash.split(":");
  if (
    prefix !== PASSWORD_HASH_PREFIX ||
    !salt ||
    !derivedKey
  ) {
    throw new AppError(
      "PRIVATE_ACCESS_HASH_INVALID",
      500,
      "Private password settings are invalid.",
    );
  }

  return { salt, derivedKey };
}

function createPasswordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${PASSWORD_HASH_PREFIX}:${salt}:${derivedKey}`;
}

function verifyPasswordAgainstHash(password: string, passwordHash: string): boolean {
  const { salt, derivedKey } = parsePasswordHash(passwordHash);
  const expected = Buffer.from(derivedKey, "hex");
  const provided = scryptSync(password, salt, expected.length);

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

export function invalidatePrivateAccessSettingsCache() {
  globalThis.__privateAccessSettingsCache = undefined;
}

export function getPrivateAccessActorKey(userId: string): string {
  return `private-access:${userId}`;
}

export async function getPrivateAccessPasswordHash(): Promise<string> {
  const cached = getCachedPrivateAccessPasswordHash();
  if (cached) {
    return cached;
  }

  const rows = await withDbConnectionRetry(async () => {
    const sql = getDb();
    return sql`
      select password_hash
      from private_access_settings
      where singleton = true
      limit 1
    `;
  });

  if (rows.length === 0) {
    throw new AppError(
      "PRIVATE_ACCESS_SETTINGS_MISSING",
      500,
      "Private password settings are not configured.",
    );
  }

  const passwordHash = String(
    (rows[0] as { password_hash: string }).password_hash,
  );
  setCachedPrivateAccessPasswordHash(passwordHash);
  return passwordHash;
}

export async function isPrivateAccessPassword(password: string): Promise<boolean> {
  const passwordHash = await getPrivateAccessPasswordHash();
  return verifyPasswordAgainstHash(password, passwordHash);
}

export async function isPrivateAccessCookieValueValid(
  value: string | undefined,
  userId: string,
): Promise<boolean> {
  if (!value) {
    return false;
  }

  const expectedValue = await getPrivateAccessCookieValue(userId);
  const expected = Buffer.from(expectedValue);
  const provided = Buffer.from(value);

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

export async function getPrivateAccessCookieValue(userId: string): Promise<string> {
  const passwordHash = await getPrivateAccessPasswordHash();
  return createPrivateAccessCookieValueFromHash(passwordHash, userId);
}

export async function updatePrivateAccessPassword(
  password: string,
  userId: string,
): Promise<string> {
  const passwordHash = createPasswordHash(password);

  await withDbConnectionRetry(async () => {
    const sql = getDb();
    await sql`
      insert into private_access_settings
        (singleton, password_hash, updated_at, updated_by)
      values
        (true, ${passwordHash}, now(), ${userId})
      on conflict (singleton)
      do update set
        password_hash = excluded.password_hash,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `;
  });

  setCachedPrivateAccessPasswordHash(passwordHash);
  return createPrivateAccessCookieValueFromHash(passwordHash, userId);
}

export function getPrivateAccessRateLimitState(actorKey: string): {
  allowed: boolean;
  retryAfterSeconds: number | null;
} {
  const nowMs = Date.now();
  const entry = clearStalePrivateAccessAttempt(actorKey, nowMs);

  if (!entry || entry.lockedUntilMs === null) {
    return { allowed: true, retryAfterSeconds: null };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((entry.lockedUntilMs - nowMs) / 1000),
    ),
  };
}

export function recordPrivateAccessFailure(actorKey: string): {
  locked: boolean;
  retryAfterSeconds: number | null;
} {
  const attempts = getPrivateAccessAttemptCache();
  const nowMs = Date.now();
  const existing = clearStalePrivateAccessAttempt(actorKey, nowMs);

  const nextEntry: PrivateAccessAttemptCacheEntry = existing
    ? {
        firstAttemptAtMs: existing.firstAttemptAtMs,
        failedCount: existing.failedCount + 1,
        lockedUntilMs: existing.lockedUntilMs,
      }
    : {
        firstAttemptAtMs: nowMs,
        failedCount: 1,
        lockedUntilMs: null,
      };

  if (nextEntry.failedCount >= PRIVATE_ACCESS_MAX_FAILED_ATTEMPTS) {
    nextEntry.lockedUntilMs = nowMs + PRIVATE_ACCESS_LOCKOUT_MS;
  }

  attempts.set(actorKey, nextEntry);

  return {
    locked: nextEntry.lockedUntilMs !== null,
    retryAfterSeconds:
      nextEntry.lockedUntilMs === null
        ? null
        : Math.max(1, Math.ceil((nextEntry.lockedUntilMs - nowMs) / 1000)),
  };
}

export function clearPrivateAccessFailures(actorKey: string) {
  getPrivateAccessAttemptCache().delete(actorKey);
}

export function getPrivateAccessCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 60 * 12,
    path: PRIVATE_ACCESS_COOKIE_PATH,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
