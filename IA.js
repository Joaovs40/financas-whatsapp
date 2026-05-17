import { getMonthSummary, saveTransaction } from "./finance.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `Você é um assistente financeiro pessoal via WhatsApp, simpático e direto.
Seu trabalho é interpretar mensagens do usuário e retornar uma ação em JSON.

AÇÕES POSSÍVEIS:
1. registrar_despesa - quando o usuário menciona um gasto
2. registrar_receita - quando o usuário menciona um ganho/entrada
3. ver_resumo - quando o usuário quer ver seus gastos ou saldo
4. ajuda - quando o usuário não sabe o que fazer
5. conversa - para mensagens gerais

CATEGORIAS de despesa: alimentação, transporte, moradia, saúde, lazer, educação, vestuário, outros
CATEGORIAS de receita: salário, freelance, investimento, outros

Retorne APENAS JSON válido neste formato:
{
  "acao": "registrar_despesa",
  "valor": 45.50,
  "categoria": "alimentação",
  "descricao": "almoço no restaurante",
  "resposta": "✅ Despesa de R$45,50 em Alimentação registrada!"
}

Para ver_resumo, ajuda e conversa, não precisa de valor/categoria:
{
  "acao": "ver_resumo",
  "resposta": "Deixa eu buscar seu resumo..."
}

Seja amigável, use emojis e mantenha respostas curtas.`;

export async function processMessage(user, text) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT + "\n\nMensagem do usuário: " + text }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
        }
      })
    });

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    if (parsed.acao === "registrar_despesa" && parsed.valor) {
      await saveTransaction({
        userId: user.id,
        type: "despesa",
        amount: parsed.valor,
        category: parsed.categoria || "outros",
        description: parsed.descricao || text,
      });
      return parsed.resposta;
    }

    if (parsed.acao === "registrar_receita" && parsed.valor) {
      await saveTransaction({
        userId: user.id,
        type: "receita",
        amount: parsed.valor,
        category: parsed.categoria || "outros",
        description: parsed.descricao || text,
      });
      return parsed.resposta;
    }

    if (parsed.acao === "ver_resumo") {
      const summary = await getMonthSummary(user.id);
      return summary;
    }

    if (parsed.acao === "ajuda") {
      return `🐷 *FinançasBot — Como usar:*

💸 *Registrar gasto:*
_"gastei 50 reais no mercado"_
_"paguei 120 de conta de luz"_

💰 *Registrar entrada:*
_"recebi 3000 de salário"_
_"ganhei 500 de freela"_

📊 *Ver resumo:*
_"qual meu resumo do mês?"_
_"quanto gastei esse mês?"_

É só mandar a mensagem naturalmente! 😊`;
    }

    return parsed.resposta || "Entendi! Como posso te ajudar com suas finanças? 😊";
  } catch (err) {
    console.error("❌ Erro ao processar com IA:", err);
    return "Ops, não entendi direito. Tenta dizer algo como: _\"gastei 50 reais no mercado\"_ 😊";
  }
}
