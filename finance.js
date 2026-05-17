import { prisma } from "./db.js";

export async function saveTransaction({ userId, type, amount, category, description }) {
  return prisma.transaction.create({
    data: { userId, type, amount, category, description, date: new Date() },
  });
}

export async function getMonthSummary(userId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startOfMonth },
    },
    orderBy: { date: "desc" },
  });

  if (transactions.length === 0) {
    return "📭 Nenhuma transação registrada este mês ainda. Me conta um gasto ou entrada!";
  }

  const receitas = transactions
    .filter((t) => t.type === "receita")
    .reduce((sum, t) => sum + t.amount, 0);

  const despesas = transactions
    .filter((t) => t.type === "despesa")
    .reduce((sum, t) => sum + t.amount, 0);

  const saldo = receitas - despesas;

  // Agrupa despesas por categoria
  const porCategoria = {};
  transactions
    .filter((t) => t.type === "despesa")
    .forEach((t) => {
      if (!porCategoria[t.category]) porCategoria[t.category] = 0;
      porCategoria[t.category] += t.amount;
    });

  const categoriasList = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `  • ${capitalize(cat)}: R$${val.toFixed(2)}`)
    .join("\n");

  const emoji = saldo >= 0 ? "😊" : "😬";
  const saldoLabel = saldo >= 0 ? "positivo" : "negativo";

  return `📊 *Resumo de ${getMonthName(now)}:*

💰 Entradas: R$${receitas.toFixed(2)}
💸 Saídas: R$${despesas.toFixed(2)}
${emoji} Saldo: R$${Math.abs(saldo).toFixed(2)} ${saldoLabel}

📂 *Gastos por categoria:*
${categoriasList || "  Nenhum gasto registrado"}

_${transactions.length} transação(ões) no mês_`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getMonthName(date) {
  return date.toLocaleString("pt-BR", { month: "long", year: "numeric" });
}
