"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ title, transcript, summary }: { title: string; transcript?: string | null; summary?: string | null }) {
  const [exportingWord, setExportingWord] = useState(false);
  const safeTitle = title.replace(/[^\w-]+/g, "-") || "meeting";

  function exportText() {
    const content = [`${title}`, "", "Transcript", transcript ?? "", "", "Summary", summary ?? ""].join("\n");
    downloadBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), `${safeTitle}.txt`);
  }

  async function exportWord() {
    setExportingWord(true);
    try {
      const { Document, HeadingLevel, Packer, Paragraph } = await import("docx");
      const toParagraphs = (text: string) => (text || "").split("\n").map((line) => new Paragraph({ text: line }));

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
              new Paragraph({ text: "Transcript", heading: HeadingLevel.HEADING_1 }),
              ...toParagraphs(transcript ?? ""),
              new Paragraph({ text: "" }),
              new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_1 }),
              ...toParagraphs(summary ?? "")
            ]
          }
        ]
      });

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `${safeTitle}.docx`);
    } finally {
      setExportingWord(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="kh-button-secondary" onClick={exportText}>
        <Download className="h-4 w-4" /> Export text
      </button>
      <button type="button" className="kh-button-secondary" onClick={() => void exportWord()} disabled={exportingWord}>
        <FileText className="h-4 w-4" /> {exportingWord ? "Exporting..." : "Export Word"}
      </button>
    </div>
  );
}
