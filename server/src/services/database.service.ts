import { Pool, type PoolClient, type QueryResultRow } from "pg";

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

// Runs a parameterized query against the shared Postgres pool.
export async function queryDatabase<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

// Executes the callback inside a DB transaction and commits/rolls back automatically.
export async function withDatabaseTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Performs a simple DB ping query and returns normalized health payload data.
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

// Closes all DB connections in the pool, typically during process shutdown.
export async function closeDatabasePool() {
  await pool.end();
}
