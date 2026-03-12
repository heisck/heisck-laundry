import postgres, { type Sql } from "postgres";

declare global {
  var __laundryDb: Sql | undefined;
}

let cachedDb: Sql | null = globalThis.__laundryDb ?? null;

const MIN_DATABASE_CONNECT_TIMEOUT_SECONDS = 15;
const DEFAULT_DATABASE_RETRY_ATTEMPTS = 2;
const DEFAULT_DATABASE_RETRY_DELAY_MS = 500;
const RETRYABLE_DB_ERROR_CODES = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
]);

function readEnvNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNumericEnv(
  name: string,
  fallback: number,
  minimum?: number,
): number {
  const raw = readEnvNumber(process.env[name]);
  if (raw === null || raw <= 0) {
    return fallback;
  }

  const normalized = Math.floor(raw);
  return minimum === undefined ? normalized : Math.max(normalized, minimum);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetDbClient(): Promise<void> {
  const current = cachedDb;
  cachedDb = null;
  globalThis.__laundryDb = undefined;

  if (!current) {
    return;
  }

  try {
    await current.end({ timeout: 1 });
  } catch {
    // Best effort: a broken socket should not block a reconnect attempt.
  }
}

export function isRetryableDbConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code =
    "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return RETRYABLE_DB_ERROR_CODES.has(code);
}

export async function withDbConnectionRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const attempts = getNumericEnv(
    "DATABASE_RETRY_ATTEMPTS",
    DEFAULT_DATABASE_RETRY_ATTEMPTS,
    1,
  );
  const delayMs = getNumericEnv(
    "DATABASE_RETRY_DELAY_MS",
    DEFAULT_DATABASE_RETRY_DELAY_MS,
    1,
  );

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableDbConnectionError(error) || attempt >= attempts) {
        throw error;
      }

      console.warn("[db] retrying after connection failure", {
        attempt,
        code:
          "code" in (error as object)
            ? String((error as { code?: unknown }).code ?? "")
            : "UNKNOWN",
      });
      await resetDbClient();
      await wait(delayMs * attempt);
    }
  }

  throw new Error("Database retry failed.");
}

export function getDb(): Sql {
  if (cachedDb) {
    return cachedDb;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (/^https?:\/\//i.test(connectionString.trim())) {
    throw new Error(
      "DATABASE_URL must be a Postgres URI, not an HTTP URL. Use Supabase Database connection string (postgresql://...).",
    );
  }

  const normalizedPoolMax = getNumericEnv("DATABASE_POOL_MAX", 3, 1);

  const sslMode = process.env.DATABASE_SSL_MODE ?? "require";
  const shouldUseSsl =
    sslMode === "require" ||
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com");

  cachedDb = postgres(connectionString, {
    prepare: false,
    max: normalizedPoolMax,
    connect_timeout: getNumericEnv(
      "DATABASE_CONNECT_TIMEOUT_SECONDS",
      MIN_DATABASE_CONNECT_TIMEOUT_SECONDS,
      MIN_DATABASE_CONNECT_TIMEOUT_SECONDS,
    ),
    idle_timeout: getNumericEnv("DATABASE_IDLE_TIMEOUT_SECONDS", 20, 1),
    connection: {
      application_name: "heisck-laundry",
    },
    ssl: shouldUseSsl ? "require" : "prefer",
  });

  globalThis.__laundryDb = cachedDb;

  return cachedDb;
}
