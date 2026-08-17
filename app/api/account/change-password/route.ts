import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { normalizeAuthPassword } from "@/lib/auth-input";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const currentPassword = normalizeAuthPassword(body.currentPassword);
    const newPassword = normalizeAuthPassword(body.newPassword);

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច 6 តួ។" }, { status: 400 });
    }

    const record = await prisma.user.findUnique({ where: { id: user.id } });
    if (!record) {
      return NextResponse.json({ error: "រកមិនឃើញគណនីនេះទេ។" }, { status: 404 });
    }

    const currentOk = await compare(currentPassword, record.passwordHash);
    if (!currentOk) {
      return NextResponse.json({ error: "ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ។" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(newPassword, 10) }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "មិនអាចប្តូរពាក្យសម្ងាត់បានទេ។ សូមសាកល្បងម្ដងទៀត។" }, { status: 500 });
  }
}
