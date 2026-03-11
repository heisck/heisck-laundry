import postgres, { type Sql } from "postgres";

declare global {
  var __laundryDb: Sql | undefined;
}

let cachedDb: Sql | null = globalThis.__laundryDb ?? null;

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

  const poolMax = Number(process.env.DATABASE_POOL_MAX ?? 3);
  const normalizedPoolMax =
    Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 3;

  const sslMode = process.env.DATABASE_SSL_MODE ?? "require";
  const shouldUseSsl =
    sslMode === "require" ||
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com");

  cachedDb = postgres(connectionString, {
    prepare: false,
    max: normalizedPoolMax,
    connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS ?? 5),
    idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT_SECONDS ?? 20),
    connection: {
      application_name: "heisck-laundry",
    },
    ssl: shouldUseSsl ? "require" : "prefer",
  });

  globalThis.__laundryDb = cachedDb;

  return cachedDb;
}
