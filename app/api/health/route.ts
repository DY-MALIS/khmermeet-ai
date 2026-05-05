import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "connected" });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        message: "Local database is not ready. Run Prisma migration/seed."
      },
      { status: 503 }
    );
  }
}
