"use client";

import { Download, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { useState } from "react";
import { summaryHeadings } from "@/lib/ai/prompts/summaryPrompt";
import { readJsonResponse } from "@/lib/read-json-response";

type ExportTask = {
  title: string;
  assigneeName: string | null;
  deadline: Date | null;
  priority: string;
  status: string;
};

// Leelawadee UI ships with Windows 10/11 and is one of the few fonts with
// proper Khmer glyph coverage - without setting this explicitly, both Word
// and PowerPoint fall back to their default (Calibri), which can't render
// Khmer script at all.
const KHMER_FONT = "Leelawadee UI";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Hand-rolling raw OOXML for .pptx (the previous approach here) proved too
// fragile - real PowerPoint rejected the file outright on schema violations
// that no amount of re-parsing with lenient tools (a zip reader, even
// python-pptx) caught. pptxgenjs is a mature, widely-used library that gets
// this right, but its npm package pulls in a Node-only dependency chain
// (the `https` package, @types/node) that Turbopack can't bundle for the
// browser - that's why an earlier session removed it as an npm dependency.
// Loading its prebuilt browser bundle as a plain <script> tag from our own
// /public folder sidesteps Turbopack entirely (static assets are served
// as-is, never bundled) while still getting a real, schema-correct library.
declare global {
  interface Window {
    PptxGenJS?: new () => PptxGenJSInstance;
  }
}

type PptxGenJSInstance = {
  layout: string;
  defineLayout(spec: { name: string; width: number; height: number }): void;
  addSlide(): PptxGenJSSlide;
  writeFile(opts: { fileName: string }): Promise<unknown>;
};

type PptxGenJSSlide = {
  background: { color: string };
  addText(text: string | { text: string; options?: Record<string, unknown> }[], options: Record<string, unknown>): void;
};

let pptxGenJsLoad: Promise<void> | null = null;
function loadPptxGenJs(): Promise<void> {
  if (window.PptxGenJS) return Promise.resolve();
  if (!pptxGenJsLoad) {
    pptxGenJsLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/pptxgen.bundle.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the PowerPoint export library."));
      document.head.appendChild(script);
    });
  }
  return pptxGenJsLoad;
}

export function ExportButton({
  meetingId,
  title,
  transcript,
  summary,
  tasks = [],
  language = "km"
}: {
  meetingId?: string;
  title: string;
  transcript?: string | null;
  summary?: string | null;
  tasks?: ExportTask[];
  language?: "km" | "en" | "km-en";
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
      const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
      // docx's `size` is in half-points (24 = 12pt). Paragraph's plain
      // `text:` shorthand and the Title/Heading styles both default to a
      // small ~10-11pt body size, which read as too small on screen - every
      // run below sets its size and font explicitly instead of relying on
      // those defaults.
      const bodySize = 26; // 13pt
      const toParagraphs = (text: string) =>
        (text || "").split("\n").map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line, size: bodySize, font: KHMER_FONT })],
              spacing: { after: 160 }
            })
        );
      const heading = (text: string) =>
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 320, after: 200 },
          children: [new TextRun({ text, size: 32, bold: true, font: KHMER_FONT, color: "18745F" })]
        });

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 320 },
                children: [new TextRun({ text: title, size: 48, bold: true, font: KHMER_FONT, color: "18745F" })]
              }),
              heading("Transcript"),
              ...toParagraphs(transcript ?? ""),
              new Paragraph({ text: "" }),
              heading("Summary"),
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
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "KhmerMeet AI";
      const nonEmptyLines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

      const summaryRows: (string | undefined)[][] = [
        ["Meeting", title],
        [],
        ["Summary"],
        ...nonEmptyLines(summary ?? "(no summary yet)").map((line) => [line]),
        [],
        ["Transcript"],
        ...nonEmptyLines(transcript ?? "(no transcript yet)").map((line) => [line])
      ];
      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.addRows(summaryRows);
      summarySheet.getColumn(1).width = 110;
      summarySheet.getColumn(2).width = 40;
      summarySheet.getRow(1).font = { bold: true };

      const tasksSheet = workbook.addWorksheet("Tasks");
      tasksSheet.addRow(["Task", "Assignee", "Deadline", "Priority", "Status"]);
      for (const task of tasks) {
        tasksSheet.addRow([
          task.title,
          task.assigneeName ?? "",
          task.deadline ? task.deadline.toISOString().slice(0, 10) : "",
          task.priority,
          task.status
        ]);
      }
      tasksSheet.columns = [{ width: 40 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 14 }];
      tasksSheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(
        new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${safeTitle}.xlsx`
      );
    } finally {
      setExportingExcel(false);
    }
  }

  async function exportSlides() {
    setExportingSlides(true);
    try {
      await loadPptxGenJs();
      const PptxGenJS = window.PptxGenJS;
      if (!PptxGenJS) throw new Error("Could not load the PowerPoint export library.");
      const isEnglish = language === "en";
      const labels = {
        summary: isEnglish ? "Summary" : "សង្ខេប (Summary)",
        tasks: isEnglish ? "Tasks" : "កិច្ចការ (Tasks)",
        noSummary: isEnglish ? "No summary available." : "មិនទាន់មានសង្ខេប។",
        outline: isEnglish ? "Outline" : "មាតិកា (Outline)"
      };

      const knownHeadings = new Set(Object.values(summaryHeadings[language === "en" ? "en" : "km"]));
      function parseSummarySections(text: string): { title: string; bullets: string[] }[] {
        const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
        const sections: { title: string; bullets: string[] }[] = [];
        let current: { title: string; bullets: string[] } | null = null;
        for (const line of lines) {
          if (knownHeadings.has(line)) {
            current = { title: line, bullets: [] };
            sections.push(current);
            continue;
          }
          if (!current) {
            current = { title: labels.summary, bullets: [] };
            sections.push(current);
          }
          const bulletMatch = line.match(/^[-•]\s*(.*)$/);
          const content = bulletMatch ? bulletMatch[1] : line;
          if (content) current.bullets.push(content);
        }
        return sections.filter((section) => section.bullets.length).length
          ? sections.filter((section) => section.bullets.length)
          : [{ title: labels.summary, bullets: [labels.noSummary] }];
      }

      // Slides are read out loud and explained verbally, not read like a
      // document - the raw summary's full sentences are too long for that,
      // so ask the AI to shorten each bullet to a short slide phrase first.
      // Fall back to the raw summary if that call fails for any reason
      // (no AI key, network error, rate limit) so export never breaks.
      let slideSummary = summary ?? "";
      if (meetingId && slideSummary.trim()) {
        try {
          const response = await fetch(`/api/meetings/${meetingId}/slide-bullets`, { method: "POST" });
          const data = await readJsonResponse<{ slideText?: string; error?: string }>(response);
          if (data.slideText?.trim()) slideSummary = data.slideText;
        } catch {
          // keep slideSummary as the raw summary
        }
      }

      const sections = parseSummarySections(slideSummary);
      const chapterName = (sectionLabel: string) => `${title} - ${sectionLabel}`;
      const outlineEntries = [...sections.map((section) => section.title), ...(tasks.length ? [labels.tasks] : [])];
      const slidesContent: { title: string; lines: string[]; titleSlide?: boolean }[] = [
        { title, lines: [new Date().toLocaleDateString(), "KhmerMeet AI"], titleSlide: true }
      ];
      if (outlineEntries.length > 1) {
        slidesContent.push({ title: labels.outline, lines: outlineEntries.map((entry, index) => `${index + 1}. ${chapterName(entry)}`) });
      }
      const bulletsPerSlide = 7;
      for (const section of sections) {
        const pageCount = Math.max(1, Math.ceil(section.bullets.length / bulletsPerSlide));
        for (let p = 0; p < pageCount; p += 1) {
          const sectionLabel = pageCount > 1 ? `(${p + 1}/${pageCount})` : "";
          const pageBullets = section.bullets.slice(p * bulletsPerSlide, (p + 1) * bulletsPerSlide);
          slidesContent.push({
            title: [chapterName(section.title), sectionLabel].filter(Boolean).join(" "),
            lines: pageBullets.length ? pageBullets : [labels.noSummary]
          });
        }
      }

      if (tasks.length) {
        const tasksPerSlide = 7;
        const taskPageCount = Math.ceil(tasks.length / tasksPerSlide);
        for (let i = 0; i < taskPageCount; i += 1) {
          const tasksLabel = taskPageCount > 1 ? `(${i + 1}/${taskPageCount})` : "";
          const pageTasks = tasks.slice(i * tasksPerSlide, (i + 1) * tasksPerSlide);
          slidesContent.push({
            title: [chapterName(labels.tasks), tasksLabel].filter(Boolean).join(" "),
            lines: pageTasks.map((task) => {
              const meta = [task.assigneeName, task.deadline ? task.deadline.toISOString().slice(0, 10) : null].filter(Boolean);
              return `${task.title}${meta.length ? ` (${meta.join(", ")})` : ""} - ${task.priority}/${task.status}`;
            })
          });
        }
      }

      const pptx = new PptxGenJS();
      pptx.defineLayout({ name: "KH169", width: 10, height: 5.625 });
      pptx.layout = "KH169";

      slidesContent.forEach((content, index) => {
        const slide = pptx.addSlide();
        slide.background = { color: content.titleSlide ? "18745F" : "FFFFFF" };
        slide.addText(content.title, {
          x: 0.5,
          y: content.titleSlide ? 1.7 : 0.4,
          w: 9,
          h: 1,
          fontSize: content.titleSlide ? 34 : 24,
          bold: true,
          color: content.titleSlide ? "FFFFFF" : "18745F",
          align: content.titleSlide ? "center" : "left",
          fontFace: KHMER_FONT
        });
        slide.addText(
          content.lines.map((line) => ({ text: line, options: { bullet: !content.titleSlide, breakLine: true } })),
          {
            x: content.titleSlide ? 0.5 : 0.6,
            y: content.titleSlide ? 3 : 1.5,
            w: content.titleSlide ? 9 : 8.5,
            h: 3.2,
            fontSize: content.titleSlide ? 16 : 14,
            color: content.titleSlide ? "FFFFFF" : "17202A",
            align: content.titleSlide ? "center" : "left",
            fontFace: KHMER_FONT
          }
        );
        slide.addText(`KhmerMeet AI  ${String(index + 1).padStart(2, "0")}`, {
          x: 0.5,
          y: 5.15,
          w: 9,
          h: 0.3,
          fontSize: 9,
          color: content.titleSlide ? "FFFFFF" : "5B6672",
          align: "center",
          fontFace: KHMER_FONT
        });
      });

      await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
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

