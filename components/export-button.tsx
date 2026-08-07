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
  tasks = [],
  language = "km"
}: {
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
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      // A single wide column reads far better than SheetJS's default ~8-char
      // width, which truncates every line of transcript/summary text.
      summarySheet["!cols"] = [{ wch: 110 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      const tasksSheet = XLSX.utils.json_to_sheet(
        tasks.map((task) => ({
          Task: task.title,
          Assignee: task.assigneeName ?? "",
          Deadline: task.deadline ? task.deadline.toISOString().slice(0, 10) : "",
          Priority: task.priority,
          Status: task.status
        }))
      );
      tasksSheet["!cols"] = [{ wch: 40 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
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
      pptx.defineLayout({ name: "KH_16x9", width: 10, height: 5.63 });
      pptx.layout = "KH_16x9";
      // Leelawadee UI ships with Windows 10/11 and is one of the few fonts
      // with proper Khmer glyph coverage - without this, PowerPoint falls
      // back to its default (Calibri), which can't render Khmer script.
      const KHMER_FONT = "Leelawadee UI";
      pptx.theme = { headFontFace: KHMER_FONT, bodyFontFace: KHMER_FONT };
      type PSlide = ReturnType<typeof pptx.addSlide>;

      // Brand palette, matching the app's own leaf/saffron/sky/ink colors.
      const BRAND = { leaf: "18745F", saffron: "D8912A", sky: "2E86AB", ink: "17202A", paper: "F7F5F0" };
      const priorityColor: Record<string, string> = { high: "C0392B", medium: BRAND.saffron, low: BRAND.sky };
      let pageNumber = 0;

      // Slide language follows the meeting's own language - "km-en" (mixed,
      // preserve-as-spoken) defaults to Khmer labels since that's this app's
      // primary language.
      const isEnglish = language === "en";
      const labels = {
        summary: isEnglish ? "Summary" : "សង្ខេប (Summary)",
        summaryPage: isEnglish ? "Summary" : "សង្ខេប",
        tasks: isEnglish ? "Tasks" : "កិច្ចការ (Tasks)",
        tasksPage: isEnglish ? "Tasks" : "កិច្ចការ",
        noSummary: isEnglish ? "No summary available." : "មិនទាន់មានសង្ខេប។",
        outline: isEnglish ? "Outline" : "មាតិកា (Outline)"
      };

      // The AI summary text already comes back structured as
      // "heading\n- bullet\n- bullet\n\nheading\n- bullet..." (see
      // buildSummaryPrompt) - split it into named sections instead of
      // dumping every line as one flat bullet list, so the deck reads like
      // a lesson (chapter title + sub-points) instead of a wall of bullets.
      function parseSummarySections(text: string): { title: string; bullets: string[] }[] {
        const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
        const sections: { title: string; bullets: string[] }[] = [];
        let current: { title: string; bullets: string[] } | null = null;
        for (const line of lines) {
          const bulletMatch = line.match(/^[-•]\s*(.*)$/);
          if (bulletMatch) {
            if (!current) {
              current = { title: labels.summary, bullets: [] };
              sections.push(current);
            }
            if (bulletMatch[1]) current.bullets.push(bulletMatch[1]);
          } else {
            current = { title: line, bullets: [] };
            sections.push(current);
          }
        }
        return sections.filter((section) => section.bullets.length).length
          ? sections.filter((section) => section.bullets.length)
          : [{ title: labels.summary, bullets: [labels.noSummary] }];
      }

      function addLogoMark(slide: PSlide, x: number, y: number, size: number, fill: string, textColor: string) {
        slide.addShape("roundRect", { x, y, w: size, h: size, rectRadius: size * 0.22, fill: { color: fill }, line: { type: "none" } });
        slide.addText("K", {
          x,
          y,
          w: size,
          h: size,
          align: "center",
          valign: "middle",
          bold: true,
          color: textColor,
          fontSize: size * 34,
          fontFace: KHMER_FONT
        });
      }

      function addFooter(slide: PSlide) {
        pageNumber += 1;
        slide.addText("KhmerMeet AI", { x: 0.4, y: 5.28, w: 4, h: 0.3, fontSize: 9, color: "9AA5B1", italic: true, fontFace: KHMER_FONT });
        slide.addText(String(pageNumber), {
          x: 9.2,
          y: 5.28,
          w: 0.5,
          h: 0.3,
          fontSize: 9,
          color: "9AA5B1",
          align: "right",
          fontFace: KHMER_FONT
        });
      }

      function addHeader(slide: PSlide, headerTitle: string, chapterNumber?: number) {
        slide.background = { color: "FFFFFF" };
        slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.12, fill: { color: BRAND.leaf }, line: { type: "none" } });
        addLogoMark(slide, 0.4, 0.34, 0.45, BRAND.leaf, "FFFFFF");
        const titleRuns = chapterNumber
          ? [
              { text: `${String(chapterNumber).padStart(2, "0")}  `, options: { color: BRAND.saffron, bold: true } },
              { text: headerTitle, options: { color: BRAND.ink, bold: true } }
            ]
          : [{ text: headerTitle, options: { color: BRAND.ink, bold: true } }];
        slide.addText(titleRuns, { x: 1.0, y: 0.3, w: 8.4, h: 0.55, fontSize: 22, fontFace: KHMER_FONT });
        addFooter(slide);
      }

      // Title slide
      const titleSlide = pptx.addSlide();
      titleSlide.background = { color: BRAND.leaf };
      addLogoMark(titleSlide, 4.55, 1.15, 0.9, "FFFFFF", BRAND.leaf);
      titleSlide.addText(title, {
        x: 0.6,
        y: 2.3,
        w: 8.8,
        h: 1.2,
        fontSize: 30,
        bold: true,
        align: "center",
        color: "FFFFFF",
        fontFace: KHMER_FONT
      });
      titleSlide.addText(new Date().toLocaleDateString(), {
        x: 0.6,
        y: 3.35,
        w: 8.8,
        h: 0.5,
        fontSize: 14,
        align: "center",
        color: "D7ECE4",
        fontFace: KHMER_FONT
      });
      titleSlide.addShape("rect", { x: 4.1, y: 3.95, w: 1.8, h: 0.03, fill: { color: BRAND.saffron }, line: { type: "none" } });

      // Summary sections - each becomes its own "chapter" slide (title +
      // sub-bullets), lesson-style, instead of one flat bullet dump.
      const sections = parseSummarySections(summary ?? "");
      const outlineEntries = [...sections.map((section) => section.title), ...(tasks.length ? [labels.tasks] : [])];

      // Outline slide
      if (outlineEntries.length > 1) {
        const outlineSlide = pptx.addSlide();
        addHeader(outlineSlide, labels.outline);
        outlineSlide.addText(
          outlineEntries.map((entryTitle, index) => ({
            text: `${String(index + 1).padStart(2, "0")}   ${entryTitle}`,
            options: {
              color: BRAND.ink,
              bold: true,
              fontFace: KHMER_FONT,
              breakLine: true,
              paraSpaceAfter: 14,
              lineSpacing: 24
            }
          })),
          { x: 0.5, y: 1.05, w: 9, h: 4.1, fontSize: 16, valign: "top" }
        );
      }

      let chapter = 0;
      const bulletsPerSlide = 7;
      for (const section of sections) {
        chapter += 1;
        const pageCount = Math.max(1, Math.ceil(section.bullets.length / bulletsPerSlide));
        for (let p = 0; p < pageCount; p += 1) {
          const slide = pptx.addSlide();
          addHeader(slide, pageCount > 1 ? `${section.title} (${p + 1}/${pageCount})` : section.title, chapter);
          const pageBullets = section.bullets.slice(p * bulletsPerSlide, (p + 1) * bulletsPerSlide);
          slide.addText(
            (pageBullets.length ? pageBullets : [labels.noSummary]).map((line) => ({
              text: line,
              options: {
                bullet: { indent: 18, characterCode: "25CF" },
                color: BRAND.ink,
                fontFace: KHMER_FONT,
                breakLine: true,
                paraSpaceAfter: 12,
                lineSpacing: 22
              }
            })),
            { x: 0.5, y: 1.05, w: 9, h: 4.1, fontSize: 16, valign: "top" }
          );
        }
      }

      // Tasks slide(s)
      if (tasks.length) {
        chapter += 1;
        const tasksPerSlide = 8;
        const taskPageCount = Math.ceil(tasks.length / tasksPerSlide);
        for (let i = 0; i < taskPageCount; i += 1) {
          const slide = pptx.addSlide();
          addHeader(slide, taskPageCount > 1 ? `${labels.tasksPage} (${i + 1}/${taskPageCount})` : labels.tasks, chapter);
          const pageTasks = tasks.slice(i * tasksPerSlide, (i + 1) * tasksPerSlide);
          const taskRuns = pageTasks.flatMap((task) => {
            const meta = [task.assigneeName, task.deadline ? task.deadline.toISOString().slice(0, 10) : null].filter(Boolean);
            const runs: { text: string; options: Record<string, unknown> }[] = [
              {
                text: task.title,
                options: {
                  bullet: { indent: 18, characterCode: "25CF" },
                  color: priorityColor[task.priority] ?? BRAND.ink,
                  bold: true,
                  fontFace: KHMER_FONT,
                  breakLine: !meta.length,
                  paraSpaceAfter: 12,
                  lineSpacing: 22
                }
              }
            ];
            if (meta.length) {
              runs.push({
                text: `   —   ${meta.join(" · ")}`,
                options: {
                  color: "64748B",
                  bold: false,
                  fontFace: KHMER_FONT,
                  breakLine: true,
                  paraSpaceAfter: 12,
                  lineSpacing: 22
                }
              });
            }
            return runs;
          });
          slide.addText(taskRuns, { x: 0.5, y: 1.05, w: 9, h: 4.1, fontSize: 14, valign: "top" });
        }
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
