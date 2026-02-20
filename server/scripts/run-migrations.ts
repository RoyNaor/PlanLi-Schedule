import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function getExecutedMigrations(): Promise<Set<string>> {
  const result = await pool.query("SELECT filename FROM migrations;");
  return new Set(result.rows.map(r => r.filename));
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, "..", "migrations");

  const files = fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith(".up.sql"))
    .sort();

  const executed = await getExecutedMigrations();

  for (const file of files) {
    if (executed.has(file)) {
      console.log(`⏭ Skipping ${file}`);
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf-8");

    console.log(`🚀 Running ${file}`);

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query(
        "INSERT INTO migrations (filename) VALUES ($1)",
        [file]
      );
      await pool.query("COMMIT");
      console.log(`✅ Done ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error(`❌ Failed ${file}`);
      throw err;
    }
  }
}

async function main() {
  try {
    await ensureMigrationsTable();
    await runMigrations();
    console.log("🎉 All migrations completed.");
  } finally {
    await pool.end();
  }
}

main();
