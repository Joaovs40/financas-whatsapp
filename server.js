import express from "express";
import { handleWebhook } from "./webhook.js";
import { testDB } from "./db.js";

const app = express();
app.use(express.json());

// Health check
app.get("/", (req, res) => res.json({ status: "🐷 FinançasBot rodando!" }));

// Webhook do Evolution API
app.post("/webhook", handleWebhook);

const PORT = process.env.PORT || 3000;

async function start() {
  await testDB();
  app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
  });
}

start();
