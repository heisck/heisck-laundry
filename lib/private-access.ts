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

declare global {
  var __privateAccessSettingsCache: PrivateAccessSettingsCacheEntry | undefined;
}

const PRIVATE_ACCESS_SETTINGS_CACHE_TTL_MS = 30000;
const PASSWORD_HASH_PREFIX = "scrypt";

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

function createPrivateAccessCookieValueFromHash(passwordHash: string): string {
  return createHash("sha256")
    .update(`private-access:${passwordHash}`)
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
): Promise<boolean> {
  if (!value) {
    return false;
  }

  const expectedValue = await getPrivateAccessCookieValue();
  const expected = Buffer.from(expectedValue);
  const provided = Buffer.from(value);

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

export async function getPrivateAccessCookieValue(): Promise<string> {
  const passwordHash = await getPrivateAccessPasswordHash();
  return createPrivateAccessCookieValueFromHash(passwordHash);
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
  return createPrivateAccessCookieValueFromHash(passwordHash);
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
