import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3000);

app.get("/", (_req, res) => {
  res.json({ status: "Server running 🚀" });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "planli-api" });
});

app.get("/api/version", (_req, res) => {
  res.json({
    service: "server",
    version: process.env.npm_package_version ?? "unknown",
    node: process.version,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
