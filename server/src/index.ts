import "dotenv/config";

import express from "express";
import router from "./routes.js";
import { closeDatabasePool, checkDatabaseConnection } from "./services/database.service.js";

const app = express();
app.use(express.json());
app.use(router);

const PORT = Number(process.env.PORT ?? 3000);

async function start() {
  try {
    const db = await checkDatabaseConnection();
    console.log("✅ DB connected:", db);

    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

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
    console.error("❌ Failed to connect to DB:", err);
    process.exit(1);
  }
}

start();
