import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type WorkspaceRequest = {
  transcript?: string;
  question?: string;
  language?: "km" | "en";
};

function lines(value: string) {
  return value
    .split(/\r?\n|[.!?។]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function localAnalysis(transcript: string, question = "") {
  const items = lines(transcript);
  const taskPattern = /(?:must|need to|should|will|deadline|ត្រូវ|កិច្ចការ|ផុតកំណត់)/i;
  const decisionPattern = /(?:decide|approved|agreed|សម្រេច|យល់ព្រម)/i;
  const riskPattern = /(?:risk|blocked|problem|delay|បញ្ហា|ហានិភ័យ|យឺត)/i;
  const tasks = items.filter((item) => taskPattern.test(item)).slice(0, 8);
  const decisions = items.filter((item) => decisionPattern.test(item)).slice(0, 8);
  const risks = items.filter((item) => riskPattern.test(item)).slice(0, 8);
  const answer = question
    ? items.find((item) => item.toLowerCase().includes(question.toLowerCase().split(" ")[0] || "")) ||
      "I could not find a direct answer in this transcript."
    : "";

  return {
    overview: items.slice(0, 3).join(". ") || "No meeting transcript yet.",
    decisions,
    problems: risks,
    risks,
    ideas: items.filter((item) => /idea|suggest|គំនិត|ស្នើ/i.test(item)).slice(0, 8),
    questions: items.filter((item) => /\?|តើ|why|how|what/i.test(item)).slice(0, 8),
    tasks: tasks.map((title, index) => ({
      id: `local-${index}`,
      title,
      assignee: "Unassigned",
      deadline: "",
      status: "not_started",
      priority: riskPattern.test(title) ? "high" : "medium",
    })),
    timeline: items.slice(0, 12).map((title, index) => ({
      second: index * 60,
      title,
    })),
    followUp: `Hello everyone,\n\nMeeting overview:\n${items.slice(0, 3).join(". ")}\n\nTasks:\n${tasks
      .map((task) => `- ${task}`)
      .join("\n")}\n\nThank you.`,
    answer,
  };
}

export async function POST(request: Request) {
  const user = await requireUser();
  const limited = await rateLimitResponse(user.id, "ai-generate");
  if (limited) return limited;
  const body = (await request.json()) as WorkspaceRequest;
  const transcript = body.transcript?.trim() || "";
  if (!transcript) {
    return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
  }

  const fallback = localAnalysis(transcript, body.question);
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ ...fallback, provider: "local" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "KhmerMeet AI",
      },
      body: JSON.stringify({
        model: process.env.OPEN_ROUTER_TEXT_MODEL || "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Analyze a Khmer or English meeting transcript. Return JSON with overview, decisions, problems, risks, ideas, questions, tasks, timeline, followUp, and answer. Tasks need title, assignee, deadline, priority, status. Timeline needs second and title. Never invent facts - if the transcript has no real decisions/tasks/risks/timeline, return empty arrays for those instead of inventing any. The 'question' field may be empty; if it is, set 'answer' to an empty string instead of answering a question that was not asked. Use the requested language.",
          },
          {
            role: "user",
            content: JSON.stringify({ transcript, question: body.question || "", language: body.language || "km" }),
          },
        ],
      }),
    });

    if (!response.ok) return NextResponse.json({ ...fallback, provider: "local" });
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ ...fallback, provider: "local" });
    const parsed = JSON.parse(content);
    const hasQuestion = Boolean(body.question?.trim());
    return NextResponse.json({
      ...fallback,
      ...parsed,
      // The model is asked to always return an "answer" field, but it has no
      // question to ground an answer in when the Copilot box is empty - force
      // it blank here instead of trusting the model not to invent one.
      answer: hasQuestion && typeof parsed.answer === "string" ? parsed.answer : "",
      followUp: typeof parsed.followUp === "string" ? parsed.followUp : fallback.followUp,
      provider: "openrouter"
    });
  } catch {
    return NextResponse.json({ ...fallback, provider: "local" });
  } finally {
    clearTimeout(timeout);
  }
}
