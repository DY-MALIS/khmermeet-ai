import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatTaskLine(task: { title: string; assigneeName: string | null; deadline: Date | null; meeting: { title: string } }) {
  const deadline = task.deadline ? task.deadline.toLocaleDateString() : "no deadline";
  return `- ${task.title} (${task.meeting.title}) - ${task.assigneeName ?? "unassigned"} - ${deadline}`;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const question = typeof body?.question === "string" ? body.question.trim().toLowerCase() : "";
    if (!question) return NextResponse.json({ error: "Question is required." }, { status: 400 });

    const now = new Date();
    const today = startOfDay(now);
    const mentionsMeeting = /meeting|ប្រជុំ/.test(question);
    const mentionsUpcoming = /tomorrow|next|upcoming|schedule|ស្អែក|ស្រ៊ុប/.test(question);

    if (mentionsMeeting && mentionsUpcoming) {
      return NextResponse.json({
        answer:
          "This app does not track upcoming/scheduled meetings yet - only meetings you have already recorded. Connect a calendar integration to answer questions about future meetings."
      });
    }

    if (mentionsMeeting) {
      const meetings = await prisma.meeting.findMany({
        where: { createdById: user.id },
        orderBy: { createdAt: "desc" },
        take: 5
      });
      if (!meetings.length) return NextResponse.json({ answer: "You have no recorded meetings yet." });
      const lines = meetings.map((meeting) => `- ${meeting.title} (${meeting.createdAt.toLocaleDateString()})`).join("\n");
      return NextResponse.json({ answer: `Your ${meetings.length} most recent meetings:\n${lines}` });
    }

    let deadlineFilter: { gte?: Date; lte?: Date } | undefined;
    let rangeLabel = "";
    if (/overdue|ហួសកំណត់/.test(question)) {
      deadlineFilter = { lte: now };
      rangeLabel = "overdue";
    } else if (/today|ថ្ងៃនេះ/.test(question)) {
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      deadlineFilter = { gte: today, lte: endOfDay };
      rangeLabel = "due today";
    } else if (/this week|សប្តាហ៍នេះ/.test(question)) {
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      deadlineFilter = { gte: today, lte: endOfWeek };
      rangeLabel = "due this week";
    }

    const tasks = await prisma.task.findMany({
      where: {
        meeting: { createdById: user.id },
        status: { not: "completed" },
        deadline: deadlineFilter
      },
      include: { meeting: true },
      orderBy: { deadline: "asc" },
      take: 15
    });

    if (!tasks.length) {
      return NextResponse.json({ answer: rangeLabel ? `You have no tasks ${rangeLabel}.` : "You have no pending tasks." });
    }

    const label = rangeLabel ? `Tasks ${rangeLabel}` : "Your pending tasks";
    return NextResponse.json({ answer: `${label} (${tasks.length}):\n${tasks.map(formatTaskLine).join("\n")}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Assistant failed." }, { status: 500 });
  }
}
