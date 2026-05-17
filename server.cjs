const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function testDB() {
  await prisma.$connect();
  console.log("✅ Banco conectado!");
}

const baileys = require("@whiskeysockets/baileys");
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
const qrcode = require("qrcode-terminal");
const pino = require("pino");

// AI via Gemini
async function processMessage(user, text) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const SYSTEM_PROMPT = `Você é um assistente financeiro pessoal via WhatsApp, simpático e direto.
Interprete a mensagem e retorne APENAS JSON válido:
{
  "acao": "registrar_despesa|registrar_receita|ver_resumo|ajuda|conversa",
  "valor": 45.50,
  "categoria": "alimentação|transporte|moradia|saúde|lazer|educação|vestuário|outros",
  "descricao": "descrição curta",
  "resposta": "mensagem amigável com emoji"
}
Seja simpático, use emojis.`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\nMensagem: " + text }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
      })
    });
    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    if (parsed.acao === "registrar_despesa" && parsed.valor) {
      await prisma.transaction.create({
        data: { userId: user.id, type: "despesa", amount: parsed.valor, category: parsed.categoria || "outros", description: parsed.descricao || text, date: new Date() }
      });
      return parsed.resposta;
    }

    if (parsed.acao === "registrar_receita" && parsed.valor) {
      await prisma.transaction.create({
        data: { userId: user.id, type: "receita", amount: parsed.valor, category: parsed.categoria || "outros", description: parsed.descricao || text, date: new Date() }
      });
      return parsed.resposta;
    }

    if (parsed.acao === "ver_resumo") {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const transactions = await prisma.transaction.findMany({ where: { userId: user.id, date: { gte: startOfMonth } } });
      if (transactions.length === 0) return "📭 Nenhuma transação este mês ainda!";
      const receitas = transactions.filter(t => t.type === "receita").reduce((s, t) => s + t.amount, 0);
      const despesas = transactions.filter(t => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
      const saldo = receitas - despesas;
      return `📊 *Resumo do mês:*\n\n💰 Entradas: R$${receitas.toFixed(2)}\n💸 Saídas: R$${despesas.toFixed(2)}\n${saldo >= 0 ? "😊" : "😬"} Saldo: R$${Math.abs(saldo).toFixed(2)} ${saldo >= 0 ? "positivo" : "negativo"}`;
    }

    if (parsed.acao === "ajuda") {
      return `🐷 *FinançasBot — Como usar:*\n\n💸 _"gastei 50 reais no mercado"_\n💰 _"recebi 3000 de salário"_\n📊 _"quanto gastei esse mês?"_`;
    }

    return parsed.resposta || "Como posso te ajudar? 😊";
  } catch (err) {
    console.error("❌ Erro IA:", err);
    return 'Ops! Tenta: _"gastei 50 reais no mercado"_ 😊';
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("\n📱 ESCANEIE O QR CODE COM SEU WHATSAPP:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n(WhatsApp > Aparelhos conectados > Conectar aparelho)\n");
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) startBot();
    } else if (connection === "open") {
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
    } catch (err) {
      console.error("❌ Erro:", err);
    }
  });
}

async function main() {
  await testDB();
  await startBot();
}

main();
