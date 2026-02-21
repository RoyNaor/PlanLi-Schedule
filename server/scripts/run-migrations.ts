import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Creates the migrations bookkeeping table when it does not exist yet.
async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

// Returns a set of migration filenames that already ran successfully.
async function getExecutedMigrations(): Promise<Set<string>> {
  const result = await pool.query("SELECT filename FROM migrations;");
  return new Set(result.rows.map((r) => r.filename));
}

// Executes pending .up.sql files in filename order inside DB transactions.
async function runMigrations() {
  const migrationsDir = path.join(__dirname, "..", "migrations");

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".up.sql"))
    .sort();

  const executed = await getExecutedMigrations();

  for (const file of files) {
    // Skip work that is already recorded in the migrations table.
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
      await pool.query("INSERT INTO migrations (filename) VALUES ($1)", [file]);
      await pool.query("COMMIT");
      console.log(`✅ Done ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error(`❌ Failed ${file}`);
      throw err;
    }
  }
}

// Entry point that runs migrations and always closes the DB pool.
async function main() {
  try {
    await ensureMigrationsTable();
    await runMigrations();
    console.log("🎉 All migrations completed.");
  } finally {
    await pool.end();
  }
}

void main();
