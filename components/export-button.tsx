"use client";

import { Download, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { useState } from "react";

type ExportTask = {
  title: string;
  assigneeName: string | null;
  deadline: Date | null;
  priority: string;
  status: string;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({
  title,
  transcript,
  summary,
  tasks = []
}: {
  title: string;
  transcript?: string | null;
  summary?: string | null;
  tasks?: ExportTask[];
}) {
  const [exportingWord, setExportingWord] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingSlides, setExportingSlides] = useState(false);
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

  async function exportExcel() {
    setExportingExcel(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.aoa_to_sheet([
        ["Meeting", title],
        [],
        ["Summary"],
        ...(summary ?? "").split("\n").map((line) => [line]),
        [],
        ["Transcript"],
        ...(transcript ?? "").split("\n").map((line) => [line])
      ]);
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      const taskRows = [
        ["Task", "Assignee", "Deadline", "Priority", "Status"],
        ...tasks.map((task) => [
          task.title,
          task.assigneeName ?? "",
          task.deadline ? task.deadline.toISOString().slice(0, 10) : "",
          task.priority,
          task.status
        ])
      ];
      const tasksSheet = XLSX.utils.aoa_to_sheet(taskRows);
      XLSX.utils.book_append_sheet(workbook, tasksSheet, "Tasks");

      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${safeTitle}.xlsx`
      );
    } finally {
      setExportingExcel(false);
    }
  }

  async function exportSlides() {
    setExportingSlides(true);
    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();

      const titleSlide = pptx.addSlide();
      titleSlide.addText(title, { x: 0.5, y: 2, w: 9, h: 1.5, fontSize: 32, bold: true, align: "center" });

      const summaryLines = (summary ?? "No summary available.").split("\n").filter(Boolean);
      const linesPerSlide = 10;
      for (let i = 0; i < summaryLines.length; i += linesPerSlide) {
        const slide = pptx.addSlide();
        slide.addText("Summary", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, bold: true });
        slide.addText(
          summaryLines.slice(i, i + linesPerSlide).map((line) => ({ text: line, options: { bullet: true, breakLine: true } })),
          { x: 0.5, y: 1.1, w: 9, h: 5, fontSize: 16 }
        );
      }

      if (tasks.length) {
        const slide = pptx.addSlide();
        slide.addText("Tasks", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, bold: true });
        slide.addText(
          tasks.slice(0, 10).map((task) => ({
            text: `${task.title}${task.assigneeName ? ` (${task.assigneeName})` : ""}`,
            options: { bullet: true, breakLine: true }
          })),
          { x: 0.5, y: 1.1, w: 9, h: 5, fontSize: 16 }
        );
      }

      const blob = (await pptx.write({ outputType: "blob" })) as Blob;
      downloadBlob(blob, `${safeTitle}.pptx`);
    } finally {
      setExportingSlides(false);
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
      <button type="button" className="kh-button-secondary" onClick={() => void exportExcel()} disabled={exportingExcel}>
        <FileSpreadsheet className="h-4 w-4" /> {exportingExcel ? "Exporting..." : "Export Excel"}
      </button>
      <button type="button" className="kh-button-secondary" onClick={() => void exportSlides()} disabled={exportingSlides}>
        <Presentation className="h-4 w-4" /> {exportingSlides ? "Exporting..." : "Export PowerPoint"}
      </button>
    </div>
  );
}
