import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.VERCEL) return url;
  if (!url.includes("pooler.supabase.com")) return url;

  const parsed = new URL(url);
  parsed.searchParams.set("pgbouncer", "true");
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set("connect_timeout", "10");
  return parsed.toString();
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
