import { processMessage } from "./ai.js";
import { sendMessage } from "./whatsapp.js";
import { prisma } from "./db.js";

export async function handleWebhook(req, res) {
  res.sendStatus(200); // Responde rápido para o Evolution API

  try {
    const body = req.body;

    // Filtra apenas mensagens de texto recebidas
    const event = body?.event;
    if (event !== "messages.upsert") return;

    const message = body?.data?.messages?.[0];
    if (!message || message.key?.fromMe) return;

    const phone = message.key?.remoteJid?.replace("@s.whatsapp.net", "");
    const text =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text;

    if (!phone || !text) return;

    console.log(`📩 Mensagem de ${phone}: ${text}`);

    // Garante que o usuário existe no banco
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });

    // Processa com IA e obtém resposta
    const reply = await processMessage(user, text);

    // Envia resposta no WhatsApp
    await sendMessage(phone, reply);
  } catch (err) {
    console.error("❌ Erro no webhook:", err);
  }
}
