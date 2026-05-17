const EVOLUTION_URL = process.env.EVOLUTION_API_URL; // ex: http://localhost:8080
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE; // nome da instância criada

export async function sendMessage(phone, text) {
  try {
    const response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: `${phone}@s.whatsapp.net`,
        textMessage: { text },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("❌ Erro ao enviar mensagem:", err);
    }
  } catch (err) {
    console.error("❌ Falha ao enviar mensagem:", err);
  }
}
