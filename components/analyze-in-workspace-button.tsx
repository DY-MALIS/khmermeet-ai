"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { AI_WORKSPACE_PENDING_TRANSCRIPT_KEY } from "@/lib/ai-workspace-handoff";

export function AnalyzeInWorkspaceButton({ transcript, className }: { transcript: string; className?: string }) {
  const router = useRouter();

  function handleClick() {
    sessionStorage.setItem(AI_WORKSPACE_PENDING_TRANSCRIPT_KEY, transcript);
    router.push("/ai-workspace");
  }

  return (
    <button className={className ?? "kh-button-secondary"} onClick={handleClick} type="button">
      <Sparkles className="h-4 w-4" />
      វិភាគជាមួយ AI Workspace
    </button>
  );
}
