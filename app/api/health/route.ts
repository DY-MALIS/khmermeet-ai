import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error && typeof error.code === "string"
        ? error.code
        : "DATABASE_CONNECTION_ERROR";
    const hints: Record<string, string> = {
      P1000: "The database username or password is invalid.",
      P1001: "The database server cannot be reached. Check the Supabase project and pooler host.",
      P1003: "The configured database does not exist.",
      P2021: "Database tables are missing. Run the Prisma migration."
    };

    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        code,
        message: "The production database is unavailable. No data has been treated as deleted.",
        hint: hints[code] ?? "Check DATABASE_URL, Supabase project status, pooler credentials, and Prisma migration."
      },
      { status: 503 }
    );
  }
}
