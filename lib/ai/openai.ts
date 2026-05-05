import OpenAI from "openai";
import { z } from "zod";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summaryPrompt";
import { buildTaskExtractionPrompt } from "@/lib/ai/prompts/taskExtractionPrompt";

const taskSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().nullable().optional(),
      assigneeName: z.string().nullable().optional(),
      deadline: z.string().nullable().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
      sourceText: z.string().nullable().optional()
    })
  )
});

function client() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function generateMeetingSummary(transcript: string) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  const response = await client().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildSummaryPrompt(transcript) }],
    temperature: 0.2
  });
  return response.choices[0]?.message.content?.trim() ?? "";
}

export async function extractMeetingTasks(transcript: string) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  const response = await client().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildTaskExtractionPrompt(transcript) }],
    response_format: { type: "json_object" },
    temperature: 0.1
  });
  const raw = response.choices[0]?.message.content ?? "{\"tasks\":[]}";
  return taskSchema.parse(JSON.parse(raw)).tasks;
}
