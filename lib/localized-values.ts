import type { UiTextKey } from "@/lib/ui-translations";

type Text = Record<UiTextKey, string>;

export function localizedPriority(value: string, text: Text) {
  if (value === "low") return text.low;
  if (value === "medium") return text.medium;
  if (value === "high") return text.high;
  return value;
}

export function localizedTaskStatus(value: string, text: Text) {
  if (value === "not_started") return text.notStarted;
  if (value === "in_progress") return text.inProgress;
  if (value === "completed") return text.completed;
  return value;
}

export function localizedMeetingStatus(value: string, language: "km" | "en") {
  const labels: Record<string, [string, string]> = {
    recorded: ["បានថត", "Recorded"],
    transcribed: ["បានបម្លែងជាអត្ថបទ", "Transcribed"],
    summarized: ["បានសង្ខេប", "Summarized"]
  };
  const pair = labels[value];
  return pair ? pair[language === "km" ? 0 : 1] : value;
}
