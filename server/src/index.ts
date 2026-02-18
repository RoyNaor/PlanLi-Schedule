import dotenv from "dotenv";
import express from "express";

import router from "./routes.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(router);

const PORT = Number(process.env.PORT ?? 3000);

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

function shutdown() {
  console.log("Shutting down server...");
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
