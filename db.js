import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function testDB() {
  try {
    await prisma.$connect();
    console.log("✅ Banco de dados conectado!");
  } catch (err) {
    console.error("❌ Erro ao conectar no banco:", err);
    process.exit(1);
  }
}
