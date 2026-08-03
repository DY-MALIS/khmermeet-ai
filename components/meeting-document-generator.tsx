"use client";

import { useState } from "react";
import { Copy, Download, FileText, Loader2 } from "lucide-react";
import { readJsonResponse } from "@/lib/read-json-response";

const documentTypes: { value: string; label: string }[] = [
  { value: "minutes", label: "Minutes of Meeting" },
  { value: "proposal", label: "Proposal" },
  { value: "project_plan", label: "Project Plan" },
  { value: "report", label: "Report" },
  { value: "sop", label: "SOP" },
  { value: "contract_draft", label: "Contract Draft" }
];

export function MeetingDocumentGenerator({ meetingId, meetingTitle, hasTranscript }: { meetingId: string; meetingTitle: string; hasTranscript: boolean }) {
  const [type, setType] = useState(documentTypes[0].value);
  const [document, setDocument] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      const data = await readJsonResponse<{ document?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not generate document.");
      setDocument(data.document ?? "");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not generate document.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!document) return;
    await navigator.clipboard.writeText(document);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    if (!document) return;
    const blob = new Blob([document], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${meetingTitle}-${type}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="kh-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-bold">
          <FileText className="h-4 w-4 text-leaf" />
          AI Document Generator
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select className="kh-input h-10 w-auto" value={type} onChange={(event) => setType(event.target.value)} disabled={loading}>
            {documentTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="kh-button-primary" type="button" onClick={() => void generate()} disabled={!hasTranscript || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Generate
          </button>
        </div>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
      {document ? (
        <div className="rounded-lg border border-slate-100 bg-white p-3">
          <div className="mb-2 flex justify-end gap-2">
            <button className="kh-button-secondary" type="button" onClick={() => void copy()}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="kh-button-secondary" type="button" onClick={download}>
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{document}</pre>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Pick a document type and generate it from this meeting&apos;s transcript in one click.</p>
      )}
    </section>
  );
}
