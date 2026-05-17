import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { processMessage } from "./ai.js";
import { prisma } from "./db.js";

export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket.default({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n(Abra o WhatsApp > Aparelhos conectados > Conectar aparelho)\n");
    }

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("❌ Conexão encerrada. Reconectando:", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("✅ WhatsApp conectado com sucesso!");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg || msg.key.fromMe) return;

    const phone = msg.key.remoteJid?.replace("@s.whatsapp.net", "");
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    if (!phone || !text || phone.includes("@g.us")) return; // ignora grupos

    console.log(`📩 Mensagem de ${phone}: ${text}`);

    try {
      const user = await prisma.user.upsert({
        where: { phone },
        update: {},
        create: { phone },
      });

      // Mostra "digitando..."
      await sock.sendPresenceUpdate("composing", msg.key.remoteJid);

      const reply = await processMessage(user, text);

      await sock.sendMessage(msg.key.remoteJid, { text: reply });
    } catch (err) {
      console.error("❌ Erro ao processar mensagem:", err);
    }
  });
}
