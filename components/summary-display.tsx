const summaryHeadings = [
  "សង្ខេបប្រជុំ",
  "ចំណុចសំខាន់ៗ",
  "ការសម្រេចចិត្ត",
  "បញ្ហាដែលបានលើកឡើង",
  "ជំហានបន្ទាប់",
  "Meeting overview",
  "Key discussion points",
  "Decisions made",
  "Problems mentioned",
  "Next steps"
];

function normalizeSummaryHeading(line: string) {
  return line
    .replace(/\*\*/g, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^#+\s*/, "")
    .replace(/:$/, "")
    .trim();
}

function isSummaryHeading(line: string) {
  const normalized = normalizeSummaryHeading(line);
  return summaryHeadings.some((heading) => heading.toLowerCase() === normalized.toLowerCase());
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
      current = { title: "សង្ខេបប្រជុំ", items: [] };
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
            <p className="text-sm text-slate-500">មិនមានព័ត៌មានច្បាស់លាស់</p>
          )}
        </div>
      ))}
    </div>
  );
}
