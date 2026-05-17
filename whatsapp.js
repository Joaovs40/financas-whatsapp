const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE;

export async function sendMessage(phone, text) {
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify({ number: `${phone}@s.whatsapp.net`, textMessage: { text } }),
    });
  } catch (err) {
    console.error("❌ Erro ao enviar:", err);
  }
}
