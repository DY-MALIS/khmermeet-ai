import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.VERCEL || url.includes("pgbouncer=true")) return url;
  if (!url.includes("pooler.supabase.com")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: databaseUrl() ? { db: { url: databaseUrl() } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
