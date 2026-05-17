import express from "express";
import { handleWebhook } from "./webhook.js";
import { testDB } from "./db.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "🐷 FinançasBot rodando!" }));
app.post("/webhook", handleWebhook);

const PORT = process.env.PORT || 3000;

async function start() {
  await testDB();
  app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
  });
}

start();
