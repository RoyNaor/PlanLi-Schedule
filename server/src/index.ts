import "dotenv/config";

import express from "express";
import router from "./routes.js";
import cors from "cors";
import { closeDatabasePool, checkDatabaseConnection } from "./services/database.service.js";

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(cors());
app.use(router);

const PORT = Number(process.env.PORT ?? 3000);

// Boots the API server only after confirming the database connection is healthy.
// Also wires graceful shutdown handlers so open resources are closed safely.
async function start() {
  try {
    // Fail fast if we cannot reach Postgres before accepting requests.
    await checkDatabaseConnection();
    console.log("✅ Database connection established.");

    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    // Handles process termination signals and drains the HTTP/database resources.
    async function shutdown() {
      console.log("Shutting down server...");
      server.close(async () => {
        await closeDatabasePool();
        process.exit(0);
      });
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to connect to DB: ${message}`);
    process.exit(1);
  }
}

start();
