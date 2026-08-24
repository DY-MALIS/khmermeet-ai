const khmerSummaryHeadings = [
  "\u179f\u1784\u17d2\u1781\u17c1\u1794\u1794\u17d2\u179a\u1787\u17bb\u17c6",
  "\u1785\u17c6\u178e\u17bb\u1785\u179f\u17c6\u1781\u17b6\u1793\u17cb\u17d7",
  "\u1780\u17b6\u179a\u179f\u1798\u17d2\u179a\u17c1\u1785\u1785\u17b7\u178f\u17d2\u178f",
  "\u1794\u1789\u17d2\u17a0\u17b6\u178a\u17c2\u179b\u1794\u17b6\u1793\u179b\u17be\u1780\u17a1\u17be\u1784",
  "\u1787\u17c6\u17a0\u17b6\u1793\u1794\u1793\u17d2\u1791\u17b6\u1794\u17cb"
];

const englishSummaryHeadings = [
  "Meeting overview",
  "Key points",
  "Key discussion points",
  "Important details",
  "Decisions made",
  "Decisions",
  "Problems mentioned",
  "Problems raised",
  "Next steps",
  "Content type",
  "Main idea",
  "Takeaways",
  "Actions or next steps"
];

const summaryHeadings = [...khmerSummaryHeadings, ...englishSummaryHeadings];
const canonicalHeadingLabels: Record<string, string> = {
  "key discussion points": "Key points",
  "decisions made": "Decisions",
  "problems mentioned": "Problems raised"
};

function normalizeSummaryHeading(line: string) {
  const cleaned = line
    .replace(/\*\*/g, "")
    .replace(/^[-•*]\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^#+\s*/, "")
    .replace(/:$/, "")
    .trim();
  return canonicalHeadingLabels[cleaned.toLowerCase()] ?? cleaned;
}

function isSummaryHeading(line: string) {
  const normalized = normalizeSummaryHeading(line);
  return summaryHeadings.some((heading) => heading.toLowerCase() === normalized.toLowerCase());
}

function defaultSummaryTitle(summary: string) {
  return /[\u1780-\u17ff]/.test(summary) ? "Meeting overview" : "Meeting overview";
}

export function SummaryDisplay({ summary }: { summary: string }) {
  const sections: Array<{ title: string; items: string[] }> = [];
  let current: { title: string; items: string[] } | null = null;

  summary.split(/\n+/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    if (isSummaryHeading(line)) {
      current = { title: normalizeSummaryHeading(line), items: [] };
      sections.push(current);
      return;
    }

    if (!current) {
      current = { title: defaultSummaryTitle(summary), items: [] };
      sections.push(current);
    }

    const item = line
      .replace(/\*\*/g, "")
      .replace(/^[-•*]\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .trim();

    if (item) current.items.push(item);
  });

  if (!sections.length) {
    return <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{summary}</div>;
  }

  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4" key={`${section.title}-${index}`}>
          <h3 className="mb-2 font-bold text-ink">{section.title}</h3>
          {section.items.length ? (
            <ul className="space-y-2 text-sm leading-7 text-slate-700">
              {section.items.map((item, itemIndex) => (
                <li className="flex gap-2" key={`${section.title}-${itemIndex}`}>
                  <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No clear information available.</p>
          )}
        </div>
      ))}
    </div>
  );
}
