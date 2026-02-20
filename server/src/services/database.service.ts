import { Pool, type QueryResultRow } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn(
    "[database] DATABASE_URL is not set. Database checks will fail until configured.",
  );
}

const pool = new Pool(
  databaseUrl
    ? {
        connectionString: databaseUrl,
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : undefined,
);

export async function queryDatabase<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function checkDatabaseConnection() {
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  const result = await queryDatabase<{ server_time: Date }>(
    "SELECT NOW() AS server_time",
  );

  return {
    ok: true,
    serverTime: result.rows[0]?.server_time?.toISOString() ?? null,
  };
}

export async function closeDatabasePool() {
  await pool.end();
}
