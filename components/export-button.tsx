"use client";

import { Download } from "lucide-react";

export function ExportButton({ title, transcript, summary }: { title: string; transcript?: string | null; summary?: string | null }) {
  function exportText() {
    const content = [`${title}`, "", "Transcript", transcript ?? "", "", "Summary", summary ?? ""].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/[^\w-]+/g, "-") || "meeting"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    // TODO: PDF export.
  }

  return (
    <button type="button" className="kh-button-secondary" onClick={exportText}>
      <Download className="h-4 w-4" /> Export text
    </button>
  );
}
