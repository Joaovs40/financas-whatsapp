import { prisma } from "./db.js";

export async function saveTransaction({ userId, type, amount, category, description }) {
  return prisma.transaction.create({ data: { userId, type, amount, category, description, date: new Date() } });
}

export async function getMonthSummary(userId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const transactions = await prisma.transaction.findMany({ where: { userId, date: { gte: startOfMonth } }, orderBy: { date: "desc" } });
  if (transactions.length === 0) return "📭 Nenhuma transação este mês ainda!";
  const receitas = transactions.filter(t => t.type === "receita").reduce((s, t) => s + t.amount, 0);
  const despesas = transactions.filter(t => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
  const saldo = receitas - despesas;
  const porCategoria = {};
  transactions.filter(t => t.type === "despesa").forEach(t => { porCategoria[t.category] = (porCategoria[t.category] || 0) + t.amount; });
  const lista = Object.entries(porCategoria).sort((a,b) => b[1]-a[1]).map(([c,v]) => `  • ${c[0].toUpperCase()+c.slice(1)}: R$${v.toFixed(2)}`).join("\n");
  return `📊 *Resumo de ${now.toLocaleString("pt-BR",{month:"long",year:"numeric"})}:*\n\n💰 Entradas: R$${receitas.toFixed(2)}\n💸 Saídas: R$${despesas.toFixed(2)}\n${saldo>=0?"😊":"😬"} Saldo: R$${Math.abs(saldo).toFixed(2)} ${saldo>=0?"positivo":"negativo"}\n\n📂 *Por categoria:*\n${lista||"Nenhum gasto"}`;
}
