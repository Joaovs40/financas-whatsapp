require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const express = require("express");
const app = express();
app.use(express.json());
const baileys = require("@whiskeysockets/baileys");
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
const pino = require("pino");
const qr = require("qrcode");
const fs = require("fs");
const path = require("path");
const os = require("os");

const AUTH_DIR = path.join(os.tmpdir(), "financas_auth");

let lastQR = null;
let isConnected = false;

// ─── Web page ──────────────────────────────────────────────────────────────

app.get("/", async (req, res) => {
  if (isConnected) {
    return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#111;color:#fff">
      <h1>✅ WhatsApp Conectado!</h1><p>O bot está funcionando!</p></body></html>`);
  }
  if (!lastQR) {
    return res.send(`<html><head><meta http-equiv="refresh" content="3"></head>
      <body style="font-family:sans-serif;text-align:center;padding:50px;background:#111;color:#fff">
      <h1>⏳ Aguardando QR Code...</h1></body></html>`);
  }
  const qrImage = await qr.toDataURL(lastQR);
  res.send(`<html><head><meta http-equiv="refresh" content="30"></head>
    <body style="font-family:sans-serif;text-align:center;padding:50px;background:#111;color:#fff">
    <h1>📱 Escaneie o QR Code</h1>
    <p>WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</p>
    <img src="${qrImage}" style="width:300px;height:300px;border:10px solid white;border-radius:10px"/>
    </body></html>`);
});

// ─── Sessão no banco ────────────────────────────────────────────────────────

async function saveSession(data) {
  try {
    await prisma.$executeRaw`
      INSERT INTO "Session" (id, data) VALUES ('main', ${JSON.stringify(data)})
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(data)}
    `;
  } catch (e) {
    console.error("⚠️ Erro ao salvar sessão:", e.message);
  }
}

async function loadSession() {
  try {
    const rows = await prisma.$queryRaw`SELECT data FROM "Session" WHERE id = 'main'`;
    if (rows && rows[0]) return JSON.parse(rows[0].data);
  } catch (e) {}
  return null;
}

async function useDBAuthState() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const savedSession = await loadSession();
  if (savedSession) {
    for (const [filename, content] of Object.entries(savedSession)) {
      fs.writeFileSync(path.join(AUTH_DIR, filename), JSON.stringify(content));
    }
    console.log("📂 Sessão restaurada!");
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const saveCredsAndDB = async () => {
    await saveCreds();
    const files = {};
    if (fs.existsSync(AUTH_DIR)) {
      for (const file of fs.readdirSync(AUTH_DIR)) {
        try { files[file] = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, file), "utf8")); } catch (e) {}
      }
    }
    await saveSession(files);
  };

  return { state, saveCreds: saveCredsAndDB };
}

// ─── IA (Gemini) ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um assistente financeiro pessoal via WhatsApp chamado FinançasBot.

Analise a mensagem do usuário e responda APENAS com um objeto JSON válido, sem texto adicional, sem markdown, sem explicações.

Exemplos:
- "gastei 45 no mercado" → {"acao":"registrar_despesa","valor":45,"categoria":"alimentação","descricao":"mercado","resposta":"✅ R$45,00 em Alimentação registrado!"}
- "paguei 120 de luz" → {"acao":"registrar_despesa","valor":120,"categoria":"moradia","descricao":"conta de luz","resposta":"✅ R$120,00 em Moradia registrado!"}
- "recebi 3000 de salário" → {"acao":"registrar_receita","valor":3000,"categoria":"salário","descricao":"salário","resposta":"✅ R$3.000,00 de Salário registrado!"}
- "quanto gastei?" → {"acao":"ver_resumo","resposta":"Buscando seu resumo..."}
- "ajuda" → {"acao":"ajuda","resposta":"ajuda"}
- "oi tudo bem" → {"acao":"conversa","resposta":"Olá! 😊 Pode me contar seus gastos e eu registro pra você!"}

Categorias de despesa: alimentação, transporte, moradia, saúde, lazer, educação, vestuário, outros
Categorias de receita: salário, freelance, investimento, outros

RETORNE APENAS O JSON, SEM NADA MAIS.`;

async function callGemini(text) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\nMensagem do usuário: " + text }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
    })
  });

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  // Remove markdown code blocks e tenta encontrar o JSON
  const clean = raw.replace(/```json|```/g, "").trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON não encontrado na resposta: " + raw.substring(0, 200));
  return JSON.parse(jsonMatch[0]);
}

async function getMonthSummary(userId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: startOfMonth } },
    orderBy: { date: "desc" }
  });

  if (transactions.length === 0) {
    return "📭 Nenhuma transação este mês ainda!\n\nTenta: _\"gastei 50 reais no mercado\"_";
  }

  const receitas = transactions.filter(t => t.type === "receita").reduce((s, t) => s + t.amount, 0);
  const despesas = transactions.filter(t => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
  const saldo = receitas - despesas;

  const porCategoria = {};
  transactions.filter(t => t.type === "despesa").forEach(t => {
    porCategoria[t.category] = (porCategoria[t.category] || 0) + t.amount;
  });

  const lista = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `  • ${c[0].toUpperCase() + c.slice(1)}: R$${v.toFixed(2)}`)
    .join("\n");

  const mes = now.toLocaleString("pt-BR", { month: "long", year: "numeric" });

  return `📊 *Resumo de ${mes}:*\n\n💰 Entradas: R$${receitas.toFixed(2)}\n💸 Saídas: R$${despesas.toFixed(2)}\n${saldo >= 0 ? "😊" : "😬"} Saldo: R$${Math.abs(saldo).toFixed(2)} ${saldo >= 0 ? "positivo" : "negativo"}\n\n📂 *Por categoria:*\n${lista || "Nenhum gasto"}`;
}

async function processMessage(user, text) {
  try {
    const parsed = await callGemini(text);

    if (parsed.acao === "registrar_despesa" && parsed.valor) {
      await prisma.transaction.create({
        data: { userId: user.id, type: "despesa", amount: Number(parsed.valor), category: parsed.categoria || "outros", description: parsed.descricao || text, date: new Date() }
      });
      return parsed.resposta || `✅ R$${parsed.valor} em ${parsed.categoria} registrado!`;
    }

    if (parsed.acao === "registrar_receita" && parsed.valor) {
      await prisma.transaction.create({
        data: { userId: user.id, type: "receita", amount: Number(parsed.valor), category: parsed.categoria || "outros", description: parsed.descricao || text, date: new Date() }
      });
      return parsed.resposta || `✅ R$${parsed.valor} de ${parsed.categoria} registrado!`;
    }

    if (parsed.acao === "ver_resumo") {
      return await getMonthSummary(user.id);
    }

    if (parsed.acao === "ajuda") {
      return `🐷 *FinançasBot — Como usar:*\n\n💸 *Registrar gasto:*\n_"gastei 50 reais no mercado"_\n_"paguei 120 de luz"_\n\n💰 *Registrar entrada:*\n_"recebi 3000 de salário"_\n\n📊 *Ver resumo:*\n_"quanto gastei esse mês?"_\n_"meu resumo"_`;
    }

    return parsed.resposta || "Olá! 😊 Me conta seus gastos!\n\nExemplos:\n💸 _\"gastei 50 no mercado\"_\n💰 _\"recebi 3000 de salário\"_\n📊 _\"meu resumo\"_";
  } catch (err) {
    console.error("❌ Erro IA:", err.message);
    return "Olá! 😊 Me conta seus gastos!\n\nExemplos:\n💸 _\"gastei 50 no mercado\"_\n💰 _\"recebi 3000 de salário\"_\n📊 _\"meu resumo\"_";
  }
}

// ─── WhatsApp (Baileys) ─────────────────────────────────────────────────────

async function startBot() {
  const { state, saveCreds } = await useDBAuthState();
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr: qrCode } = update;
    if (qrCode) { lastQR = qrCode; console.log("📱 QR Code gerado! Acesse http://localhost:" + (process.env.PORT || 3000)); }
    if (connection === "close") {
      isConnected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconectando...");
        startBot();
      } else {
        console.log("❌ Desconectado (logout). Acesse a URL para escanear o QR novamente.");
        lastQR = null;
        startBot();
      }
    } else if (connection === "open") {
      isConnected = true;
      lastQR = null;
      console.log("✅ WhatsApp conectado!");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg || msg.key.fromMe) return;

    const phone = msg.key.remoteJid?.replace("@s.whatsapp.net", "");
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

    if (!phone || !text || phone.includes("@g.us")) return;
    console.log(`📩 ${phone}: ${text}`);

    try {
      const user = await prisma.user.upsert({ where: { phone }, update: {}, create: { phone } });
      await sock.sendPresenceUpdate("composing", msg.key.remoteJid);
      const reply = await processMessage(user, text);
      await sock.sendMessage(msg.key.remoteJid, { text: reply });
      console.log(`✅ Respondido: ${reply.substring(0, 60)}...`);
    } catch (err) {
      console.error("❌ Erro:", err);
    }
  });
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function main() {
  await prisma.$connect();
  console.log("✅ Banco conectado!");

  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "Session" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`;

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🌐 Servidor na porta ${PORT}`));

  await startBot();
}

main().catch(err => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
