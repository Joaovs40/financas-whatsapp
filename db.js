import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
export async function testDB() {
  try {
    await prisma.$connect();
    console.log("✅ Banco conectado!");
  } catch (err) {
    console.error("❌ Erro banco:", err);
    process.exit(1);
  }
}
