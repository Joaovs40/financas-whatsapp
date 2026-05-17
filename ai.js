import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db.js";
import { getMonthSummary, saveTransaction } from "./finance.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    // Pede para o Claude interpretar a mensagem
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    const raw = response.content[0].text;

    // Remove possíveis blocos markdown e faz parse
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Executa a ação correspondente
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
_"quanto gastei hoje?"_

É só mandar a mensagem naturalmente! 😊`;
    }

    return parsed.resposta || "Entendi! Como posso te ajudar com suas finanças? 😊";
  } catch (err) {
    console.error("❌ Erro ao processar com IA:", err);
    return "Ops, não entendi direito. Tenta dizer algo como: _\"gastei 50 reais no mercado\"_ 😊";
  }
}
