import { processMessage } from "./ai.js";
import { sendMessage } from "./whatsapp.js";
import { prisma } from "./db.js";

export async function handleWebhook(req, res) {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body?.event !== "messages.upsert") return;
    const message = body?.data?.messages?.[0];
    if (!message || message.key?.fromMe) return;
    const phone = message.key?.remoteJid?.replace("@s.whatsapp.net", "");
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
    if (!phone || !text) return;
    console.log(`📩 Mensagem de ${phone}: ${text}`);
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });
    const reply = await processMessage(user, text);
    await sendMessage(phone, reply);
  } catch (err) {
    console.error("❌ Erro no webhook:", err);
  }
}
