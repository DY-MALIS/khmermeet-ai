"use client";

import { Download, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import type JSZip from "jszip";
import { useState } from "react";
import { summaryHeadings } from "@/lib/ai/prompts/summaryPrompt";

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

type SlideContent = { title: string; lines: string[]; titleSlide?: boolean };
type JSZipCtor = typeof JSZip;

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textRun(text: string, size: number, color = "17202A", bold = false) {
  return `<a:r><a:rPr lang="km-KH" sz="${size}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${xmlEscape(KHMER_FONT)}"/><a:ea typeface="${xmlEscape(KHMER_FONT)}"/></a:rPr><a:t>${xmlEscape(text)}</a:t></a:r>`;
}

function textShape(id: number, name: string, x: number, y: number, cx: number, cy: number, paragraphs: string[], options: { size: number; color?: string; bold?: boolean; center?: boolean }) {
  const body = paragraphs
    .map((paragraph) => `<a:p><a:pPr${options.center ? ' algn="ctr"' : ""}/>${textRun(paragraph, options.size, options.color, options.bold)}</a:p>`)
    .join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="mid"/><a:lstStyle/>${body}</p:txBody></p:sp>`;
}

function slideXml(slide: SlideContent, index: number) {
  const titleColor = slide.titleSlide ? "FFFFFF" : "18745F";
  const background = slide.titleSlide ? "18745F" : "FFFFFF";
  const titleY = slide.titleSlide ? 1550000 : 520000;
  const titleSize = slide.titleSlide ? 3400 : 2400;
  const lines = slide.lines.length ? slide.lines : [""];
  const lineSize = slide.titleSlide ? 1500 : 1450;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${textShape(2, "Title", 650000, titleY, 7850000, 950000, [slide.title], { size: titleSize, color: titleColor, bold: true, center: slide.titleSlide })}
      ${textShape(3, "Content", 850000, slide.titleSlide ? 3000000 : 1500000, 7700000, 3100000, lines, { size: lineSize, color: slide.titleSlide ? "FFFFFF" : "17202A", center: slide.titleSlide })}
      ${textShape(4, "Footer", 650000, 4800000, 7850000, 300000, [`KhmerMeet AI  ${String(index + 1).padStart(2, "0")}`], { size: 850, color: slide.titleSlide ? "FFFFFF" : "5B6672", center: true })}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

async function buildPptx(JSZip: JSZipCtor, slides: SlideContent[]) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  zip.folder("ppt")?.file("presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.folder("ppt")?.folder("_rels")?.file("presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("")}</Relationships>`);
  zip.folder("ppt")?.folder("slides");
  zip.folder("ppt")?.folder("slides")?.folder("_rels");
  slides.forEach((slide, index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, slideXml(slide, index));
    zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  });
  zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld></p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  zip.file("ppt/theme/theme1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="KhmerMeet"><a:themeElements><a:clrScheme name="KhmerMeet"><a:dk1><a:srgbClr val="17202A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="18745F"/></a:dk2><a:lt2><a:srgbClr val="F7F5F0"/></a:lt2><a:accent1><a:srgbClr val="18745F"/></a:accent1><a:accent2><a:srgbClr val="D8912A"/></a:accent2><a:accent3><a:srgbClr val="2E86AB"/></a:accent3><a:accent4><a:srgbClr val="5B6672"/></a:accent4><a:accent5><a:srgbClr val="E7F3EF"/></a:accent5><a:accent6><a:srgbClr val="FBF0DE"/></a:accent6><a:hlink><a:srgbClr val="2E86AB"/></a:hlink><a:folHlink><a:srgbClr val="18745F"/></a:folHlink></a:clrScheme><a:fontScheme name="KhmerMeet"><a:majorFont><a:latin typeface="${xmlEscape(KHMER_FONT)}"/><a:ea typeface="${xmlEscape(KHMER_FONT)}"/><a:cs typeface="${xmlEscape(KHMER_FONT)}"/></a:majorFont><a:minorFont><a:latin typeface="${xmlEscape(KHMER_FONT)}"/><a:ea typeface="${xmlEscape(KHMER_FONT)}"/><a:cs typeface="${xmlEscape(KHMER_FONT)}"/></a:minorFont></a:fontScheme><a:fmtScheme name="KhmerMeet"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
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
      const JSZip = (await import("jszip")).default;
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

      const sections = parseSummarySections(summary ?? "");
      const chapterName = (sectionLabel: string) => `${title} - ${sectionLabel}`;
      const outlineEntries = [...sections.map((section) => section.title), ...(tasks.length ? [labels.tasks] : [])];
      const slides: { title: string; lines: string[]; titleSlide?: boolean }[] = [
        { title, lines: [new Date().toLocaleDateString(), "KhmerMeet AI"], titleSlide: true }
      ];
      if (outlineEntries.length > 1) {
        slides.push({ title: labels.outline, lines: outlineEntries.map((entry, index) => `${index + 1}. ${chapterName(entry)}`) });
      }
      const bulletsPerSlide = 7;
      for (const section of sections) {
        const pageCount = Math.max(1, Math.ceil(section.bullets.length / bulletsPerSlide));
        for (let p = 0; p < pageCount; p += 1) {
          const sectionLabel = pageCount > 1 ? `(${p + 1}/${pageCount})` : "";
          const pageBullets = section.bullets.slice(p * bulletsPerSlide, (p + 1) * bulletsPerSlide);
          slides.push({
            title: [chapterName(section.title), sectionLabel].filter(Boolean).join(" "),
            lines: (pageBullets.length ? pageBullets : [labels.noSummary]).map((line) => `• ${line}`)
          });
        }
      }

      if (tasks.length) {
        const tasksPerSlide = 7;
        const taskPageCount = Math.ceil(tasks.length / tasksPerSlide);
        for (let i = 0; i < taskPageCount; i += 1) {
          const tasksLabel = taskPageCount > 1 ? `(${i + 1}/${taskPageCount})` : "";
          const pageTasks = tasks.slice(i * tasksPerSlide, (i + 1) * tasksPerSlide);
          slides.push({
            title: [chapterName(labels.tasks), tasksLabel].filter(Boolean).join(" "),
            lines: pageTasks.map((task) => {
              const meta = [task.assigneeName, task.deadline ? task.deadline.toISOString().slice(0, 10) : null].filter(Boolean);
              return `• ${task.title}${meta.length ? ` (${meta.join(", ")})` : ""} - ${task.priority}/${task.status}`;
            })
          });
        }
      }

      const blob = await buildPptx(JSZip, slides);
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

