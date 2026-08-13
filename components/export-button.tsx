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

      // Brand palette, matching the app's own leaf/saffron/sky/ink colors,
      // plus light tints for card/pill backgrounds so accents read as flat
      // modern fills instead of the old plain-bullet look.
      const BRAND = {
        leaf: "18745F",
        leafLight: "E7F3EF",
        saffron: "D8912A",
        saffronLight: "FBF0DE",
        sky: "2E86AB",
        skyLight: "E7F1F7",
        ink: "17202A",
        slate: "5B6672",
        line: "E7EAED",
        paper: "F7F5F0"
      };
      const priorityColor: Record<string, string> = { high: "C0392B", medium: BRAND.saffron, low: BRAND.sky };
      const priorityTint: Record<string, string> = { high: "FBEAE8", medium: BRAND.saffronLight, low: BRAND.skyLight };
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
        slide.addShape("roundRect", { x, y, w: size, h: size, rectRadius: size * 0.28, fill: { color: fill }, line: { type: "none" } });
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
        slide.addShape("line", { x: 0.4, y: 5.22, w: 9.2, h: 0, line: { color: BRAND.line, width: 0.75 } });
        slide.addShape("ellipse", { x: 0.4, y: 5.33, w: 0.07, h: 0.07, fill: { color: BRAND.saffron }, line: { type: "none" } });
        slide.addText("KhmerMeet AI", { x: 0.54, y: 5.28, w: 3, h: 0.28, fontSize: 9, color: BRAND.slate, fontFace: KHMER_FONT });
        slide.addShape("roundRect", { x: 9.05, y: 5.27, w: 0.45, h: 0.24, rectRadius: 0.12, fill: { color: BRAND.leafLight }, line: { type: "none" } });
        slide.addText(String(pageNumber).padStart(2, "0"), {
          x: 9.05,
          y: 5.27,
          w: 0.45,
          h: 0.24,
          fontSize: 9,
          bold: true,
          color: BRAND.leaf,
          align: "center",
          valign: "middle",
          fontFace: KHMER_FONT
        });
      }

      // Chapter slides carry a small colored "eyebrow" pill above the title
      // instead of the old inline "01  Title" run - reads as a modern deck,
      // and the title itself gets room to be bigger and bolder on its own line.
      function addHeader(slide: PSlide, headerTitle: string, chapterNumber?: number, eyebrow?: string) {
        slide.background = { color: "FFFFFF" };
        slide.addShape("rect", { x: 0, y: 0, w: 6.2, h: 0.09, fill: { color: BRAND.leaf }, line: { type: "none" } });
        slide.addShape("rect", { x: 6.2, y: 0, w: 3.8, h: 0.09, fill: { color: BRAND.saffron }, line: { type: "none" } });
        addLogoMark(slide, 0.4, 0.32, 0.4, BRAND.leaf, "FFFFFF");

        if (chapterNumber) {
          const pillLabel = `${String(chapterNumber).padStart(2, "0")}${eyebrow ? `   ·   ${eyebrow}` : ""}`;
          const pillWidth = Math.min(6.5, 0.55 + pillLabel.length * 0.09);
          slide.addShape("roundRect", {
            x: 0.95,
            y: 0.32,
            w: pillWidth,
            h: 0.3,
            rectRadius: 0.15,
            fill: { color: BRAND.saffronLight },
            line: { type: "none" }
          });
          slide.addText(pillLabel, {
            x: 0.95,
            y: 0.32,
            w: pillWidth,
            h: 0.3,
            fontSize: 11,
            bold: true,
            color: BRAND.saffron,
            align: "center",
            valign: "middle",
            fontFace: KHMER_FONT
          });
          slide.addText(headerTitle, { x: 0.95, y: 0.68, w: 8.5, h: 0.55, fontSize: 25, bold: true, color: BRAND.ink, fontFace: KHMER_FONT });
        } else {
          slide.addText(headerTitle, { x: 0.95, y: 0.34, w: 8.5, h: 0.55, fontSize: 25, bold: true, color: BRAND.ink, fontFace: KHMER_FONT, valign: "middle" });
        }
        addFooter(slide);
      }

      // Title slide - large centered title over the brand color with a
      // couple of soft geometric accents instead of a flat block of color,
      // and a small date pill instead of plain floating text.
      const titleSlide = pptx.addSlide();
      titleSlide.background = { color: BRAND.leaf };
      titleSlide.addShape("ellipse", { x: 7.6, y: -1.4, w: 3.6, h: 3.6, fill: { color: "FFFFFF", transparency: 92 }, line: { type: "none" } });
      titleSlide.addShape("ellipse", { x: -1.2, y: 3.9, w: 2.6, h: 2.6, fill: { color: "FFFFFF", transparency: 92 }, line: { type: "none" } });
      addLogoMark(titleSlide, 4.55, 0.95, 0.9, "FFFFFF", BRAND.leaf);
      titleSlide.addText(title, {
        x: 0.6,
        y: 2.15,
        w: 8.8,
        h: 1.3,
        fontSize: 32,
        bold: true,
        align: "center",
        valign: "middle",
        color: "FFFFFF",
        fontFace: KHMER_FONT
      });
      titleSlide.addShape("rect", { x: 4.55, y: 3.55, w: 0.9, h: 0.025, fill: { color: BRAND.saffron }, line: { type: "none" } });
      titleSlide.addShape("roundRect", { x: 3.75, y: 3.75, w: 2.5, h: 0.4, rectRadius: 0.2, fill: { color: "FFFFFF", transparency: 88 }, line: { type: "none" } });
      titleSlide.addText(new Date().toLocaleDateString(), {
        x: 3.75,
        y: 3.75,
        w: 2.5,
        h: 0.4,
        fontSize: 13,
        align: "center",
        valign: "middle",
        color: "FFFFFF",
        fontFace: KHMER_FONT
      });

      // Summary sections - each becomes its own "chapter" slide (title +
      // sub-bullets), lesson-style, instead of one flat bullet dump. Each
      // chapter is named after the meeting itself (e.g. "plan"), not a
      // generic "AI Summary" label - the section name (Summary/Tasks/etc.)
      // is kept as the eyebrow pill so chapters stay distinguishable.
      const sections = parseSummarySections(summary ?? "");
      const chapterName = (sectionLabel: string) => `${title} — ${sectionLabel}`;
      const outlineEntries = [...sections.map((section) => section.title), ...(tasks.length ? [labels.tasks] : [])];
      const contentTop = 1.55;
      const contentHeight = 3.6;

      // Outline slide - numbered pill badges per row instead of a flat
      // "01  text" string, so it reads like a modern deck's table of contents.
      if (outlineEntries.length > 1) {
        const outlineSlide = pptx.addSlide();
        addHeader(outlineSlide, labels.outline);
        const rowHeight = Math.min(0.62, contentHeight / outlineEntries.length);
        outlineEntries.forEach((entryTitle, index) => {
          const y = contentTop + index * rowHeight;
          outlineSlide.addShape("roundRect", {
            x: 0.5,
            y: y + 0.03,
            w: 0.42,
            h: 0.42,
            rectRadius: 0.1,
            fill: { color: index % 2 === 0 ? BRAND.leafLight : BRAND.saffronLight },
            line: { type: "none" }
          });
          outlineSlide.addText(String(index + 1).padStart(2, "0"), {
            x: 0.5,
            y: y + 0.03,
            w: 0.42,
            h: 0.42,
            fontSize: 13,
            bold: true,
            align: "center",
            valign: "middle",
            color: index % 2 === 0 ? BRAND.leaf : BRAND.saffron,
            fontFace: KHMER_FONT
          });
          outlineSlide.addText(chapterName(entryTitle), {
            x: 1.1,
            y,
            w: 8.1,
            h: 0.48,
            fontSize: 16,
            bold: true,
            valign: "middle",
            color: BRAND.ink,
            fontFace: KHMER_FONT
          });
          if (index < outlineEntries.length - 1) {
            outlineSlide.addShape("line", { x: 1.1, y: y + rowHeight - 0.03, w: 8.1, h: 0, line: { color: BRAND.line, width: 0.75 } });
          }
        });
      }

      let chapter = 0;
      const bulletsPerSlide = 7;
      for (const section of sections) {
        chapter += 1;
        const pageCount = Math.max(1, Math.ceil(section.bullets.length / bulletsPerSlide));
        for (let p = 0; p < pageCount; p += 1) {
          const slide = pptx.addSlide();
          const sectionLabel = pageCount > 1 ? `(${p + 1}/${pageCount})` : "";
          addHeader(slide, chapterName(section.title), chapter, sectionLabel || labels.summaryPage);
          const pageBullets = section.bullets.slice(p * bulletsPerSlide, (p + 1) * bulletsPerSlide);
          slide.addText(
            (pageBullets.length ? pageBullets : [labels.noSummary]).map((line) => ({
              text: line,
              options: {
                bullet: { indent: 20, characterCode: "25AA", color: BRAND.saffron },
                color: BRAND.ink,
                fontFace: KHMER_FONT,
                breakLine: true,
                paraSpaceAfter: 14,
                lineSpacing: 25
              }
            })),
            { x: 0.55, y: contentTop, w: 8.9, h: contentHeight, fontSize: 17, valign: "top" }
          );
        }
      }

      // Tasks slide(s) - each task is its own rounded card with a colored
      // priority stripe instead of a plain colored bullet line, closer to a
      // kanban row than a text dump.
      if (tasks.length) {
        chapter += 1;
        const tasksPerSlide = 7;
        const taskPageCount = Math.ceil(tasks.length / tasksPerSlide);
        for (let i = 0; i < taskPageCount; i += 1) {
          const slide = pptx.addSlide();
          const tasksLabel = taskPageCount > 1 ? `(${i + 1}/${taskPageCount})` : "";
          addHeader(slide, chapterName(labels.tasksPage), chapter, tasksLabel || labels.tasksPage);
          const pageTasks = tasks.slice(i * tasksPerSlide, (i + 1) * tasksPerSlide);
          const cardGap = 0.09;
          const cardHeight = Math.min(0.5, (contentHeight - (pageTasks.length - 1) * cardGap) / pageTasks.length);
          pageTasks.forEach((task, index) => {
            const y = contentTop + index * (cardHeight + cardGap);
            const tint = priorityTint[task.priority] ?? "F1F3F5";
            const accent = priorityColor[task.priority] ?? BRAND.ink;
            const meta = [task.assigneeName, task.deadline ? task.deadline.toISOString().slice(0, 10) : null].filter(Boolean);

            slide.addShape("roundRect", { x: 0.55, y, w: 8.9, h: cardHeight, rectRadius: 0.08, fill: { color: tint }, line: { type: "none" } });
            slide.addShape("roundRect", { x: 0.55, y, w: 0.09, h: cardHeight, rectRadius: 0.045, fill: { color: accent }, line: { type: "none" } });
            slide.addText(task.title, {
              x: 0.85,
              y: y + (meta.length ? 0.04 : 0),
              w: 8.3,
              h: meta.length ? cardHeight * 0.6 : cardHeight,
              fontSize: 14,
              bold: true,
              valign: meta.length ? "bottom" : "middle",
              color: BRAND.ink,
              fontFace: KHMER_FONT
            });
            if (meta.length) {
              slide.addText(meta.join("   ·   "), {
                x: 0.85,
                y: y + cardHeight * 0.55,
                w: 8.3,
                h: cardHeight * 0.4,
                fontSize: 10.5,
                valign: "top",
                color: BRAND.slate,
                fontFace: KHMER_FONT
              });
            }
          });
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
