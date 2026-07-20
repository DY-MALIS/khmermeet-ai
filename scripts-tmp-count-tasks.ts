import { PrismaClient } from "@prisma/client";

const base = process.env.DATABASE_URL;
if (!base) throw new Error("DATABASE_URL not set (expected auto-load from .env)");
const url = base + (base.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true");

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const result = await prisma.task.deleteMany({});
  console.log(`Deleted ${result.count} task row(s).`);
  const remaining = await prisma.task.count();
  console.log(`Remaining: ${remaining}`);
}

main().finally(() => prisma.$disconnect());
