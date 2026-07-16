import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function databaseErrorDetails(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error && typeof error.code === "string"
      ? error.code
      : "DATABASE_CONNECTION_ERROR";
  const message = error instanceof Error ? error.message : "";
  const hints: Record<string, string> = {
    P1000: "The database username or password is invalid.",
    P1001: "The database server cannot be reached. Check the Supabase project and pooler host.",
    P1003: "The configured database does not exist.",
    P2021: "Database tables are missing. Run the Prisma migration or paste prisma/supabase-setup.sql in Supabase SQL Editor.",
    P2022: "A database column is missing. Run the latest Prisma migration or paste prisma/supabase-setup.sql in Supabase SQL Editor."
  };

  return {
    code,
    hint: hints[code] ?? "Check DATABASE_URL, Supabase project status, pooler credentials, and Prisma migration.",
    detail: process.env.NODE_ENV === "production" ? undefined : message
  };
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await Promise.all([
      prisma.user.findFirst({ select: { id: true } }),
      prisma.meeting.findFirst({ select: { id: true, speakerNames: true } }),
      prisma.task.findFirst({ select: { id: true } }),
      prisma.audioFile.findFirst({ select: { id: true } }),
      prisma.callSignal.findFirst({ select: { id: true } })
    ]);
    return NextResponse.json({ ok: true, database: "connected", schema: "ready" });
  } catch (error) {
    const details = databaseErrorDetails(error);

    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        code: details.code,
        message: "The production database is unavailable. No data has been treated as deleted.",
        hint: details.hint,
        detail: details.detail
      },
      { status: 503 }
    );
  }
}
