"use client";

import { useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";

type WorkspaceTask = {
  id: string;
  title: string;
  assignee: string;
  deadline: string;
  status: string;
  priority: string;
};

type WorkspaceTimelineEntry = { second: number; title: string };

type WorkspaceResult = {
  overview: string;
  decisions: string[];
  problems: string[];
  risks: string[];
  ideas: string[];
  questions: string[];
  tasks: WorkspaceTask[];
  timeline: WorkspaceTimelineEntry[];
  followUp: string;
  answer: string;
  provider?: string;
};

type Tab = "overview" | "notes" | "tasks" | "copilot" | "timeline" | "automation" | "analytics";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "notes", label: "Notes" },
  { id: "tasks", label: "Tasks" },
  { id: "copilot", label: "Copilot" },
  { id: "timeline", label: "Timeline" },
  { id: "automation", label: "Automation" },
  { id: "analytics", label: "Analytics" }
];

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function AIWorkspace() {
  const [transcript, setTranscript] = useState("");
  const [question, setQuestion] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [result, setResult] = useState<WorkspaceResult | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function analyze(nextQuestion?: string) {
    if (!transcript.trim()) {
      setMessage("Paste a transcript first.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, question: nextQuestion ?? question })
      });
      const data = await readJsonResponse<WorkspaceResult & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Analysis failed.");
      setResult(data);
      setMessage(data.provider === "openrouter" ? "Analyzed with AI." : "Analyzed locally (no AI credits used).");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setTranscript("");
    setResult(null);
    setMessage("");
  }

  async function copyFollowUp() {
    if (!result?.followUp) return;
    await navigator.clipboard.writeText(result.followUp);
    setMessage("Follow-up email copied.");
  }

  function downloadFollowUp() {
    if (!result?.followUp) return;
    const blob = new Blob([result.followUp], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "follow-up-email.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const actionableCount = (result?.tasks.length ?? 0) + (result?.decisions.length ?? 0);
  const maxCount = Math.max(actionableCount, result?.risks.length ?? 0, 1);

  return (
    <div className="ai-workspace">
      <div className="ai-workspace-header">
        <div>
          <p className="eyebrow">AI Meeting Workspace</p>
          <h1>AI Workspace</h1>
          <p>Paste any meeting transcript to get an instant overview, tasks, decisions, timeline, and follow-up email.</p>
        </div>
        <div className="score-block">
          <strong>{actionableCount}</strong>
          <span>Actionable items found</span>
        </div>
      </div>

      <div className="workspace-input">
        <label htmlFor="ai-workspace-transcript">Transcript</label>
        <textarea
          id="ai-workspace-transcript"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Paste a meeting transcript here..."
        />
        <div className="workspace-actions">
          <button className="primary" type="button" onClick={() => void analyze()} disabled={loading}>
            {loading ? "Analyzing..." : "Analyze"}
          </button>
          <button type="button" onClick={clearAll} disabled={loading}>
            Clear
          </button>
        </div>
        {message ? <p className="workspace-message">{message}</p> : null}
      </div>

      {!result ? (
        <div className="workspace-empty">
          <strong>No analysis yet</strong>
          <p>Paste a transcript above and click Analyze to get started.</p>
        </div>
      ) : (
        <>
          <div className="workspace-tabs">
            {tabs.map((tabItem) => (
              <button key={tabItem.id} type="button" className={tab === tabItem.id ? "active" : ""} onClick={() => setTab(tabItem.id)}>
                {tabItem.label}
              </button>
            ))}
          </div>

          <div className="workspace-results">
            {tab === "overview" ? (
              <section className="overview-band">
                <h2>Overview</h2>
                <p>{result.overview || "No overview available."}</p>
              </section>
            ) : null}

            {tab === "notes" ? (
              <div className="notes-grid">
                <div className="ai-note-section">
                  <h3>Decisions</h3>
                  <ul>{result.decisions.length ? result.decisions.map((item, i) => <li key={i}>{item}</li>) : <li className="muted">None found</li>}</ul>
                </div>
                <div className="ai-note-section">
                  <h3>Problems &amp; Risks</h3>
                  <ul>
                    {[...result.problems, ...result.risks].length
                      ? [...new Set([...result.problems, ...result.risks])].map((item, i) => <li key={i}>{item}</li>)
                      : <li className="muted">None found</li>}
                  </ul>
                </div>
                <div className="ai-note-section">
                  <h3>Ideas &amp; Questions</h3>
                  <ul>
                    {[...result.ideas, ...result.questions].length
                      ? [...result.ideas, ...result.questions].map((item, i) => <li key={i}>{item}</li>)
                      : <li className="muted">None found</li>}
                  </ul>
                </div>
              </div>
            ) : null}

            {tab === "tasks" ? (
              <section className="task-table">
                <h2>Tasks</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Assignee</th>
                        <th>Deadline</th>
                        <th>Priority</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.tasks.length ? (
                        result.tasks.map((task) => (
                          <tr key={task.id}>
                            <td>{task.title}</td>
                            <td>{task.assignee}</td>
                            <td>{task.deadline || "-"}</td>
                            <td>{task.priority}</td>
                            <td>
                              <span className={`status ${task.status.replace(/_/g, "-")}`}>{task.status}</span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="muted">
                            No tasks found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {tab === "copilot" ? (
              <section className="copilot-panel">
                <h2>Copilot</h2>
                <div className="copilot-input">
                  <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this meeting..." />
                  <button className="primary" type="button" onClick={() => void analyze(question)} disabled={loading || !question.trim()}>
                    Ask
                  </button>
                </div>
                <div className="copilot-answer">{result.answer || "Ask a question above to get an answer grounded in the transcript."}</div>
              </section>
            ) : null}

            {tab === "timeline" ? (
              <section className="timeline-panel">
                <h2>Timeline</h2>
                {result.timeline.length ? (
                  result.timeline.map((entry, index) => (
                    <div className="timeline-row" key={index}>
                      <time>{formatSeconds(entry.second)}</time>
                      <span>
                        <small>Topic {index + 1}</small>
                      </span>
                      <b>{entry.title.slice(0, 24)}</b>
                    </div>
                  ))
                ) : (
                  <p className="muted">No timeline detected.</p>
                )}
              </section>
            ) : null}

            {tab === "automation" ? (
              <div className="automation-grid">
                <section>
                  <h2>Follow-up email</h2>
                  <textarea readOnly value={result.followUp} />
                  <div className="document-buttons">
                    <button type="button" onClick={() => void copyFollowUp()}>
                      Copy
                    </button>
                    <button type="button" onClick={downloadFollowUp}>
                      Download
                    </button>
                  </div>
                </section>
                <section>
                  <h2>Raw analysis (JSON)</h2>
                  <code>{JSON.stringify(result, null, 2)}</code>
                </section>
              </div>
            ) : null}

            {tab === "analytics" ? (
              <div className="analytics-grid">
                <section>
                  <span>Decisions</span>
                  <strong>{result.decisions.length}</strong>
                  <progress value={result.decisions.length} max={maxCount} />
                </section>
                <section>
                  <span>Tasks</span>
                  <strong>{result.tasks.length}</strong>
                  <progress value={result.tasks.length} max={maxCount} />
                </section>
                <section>
                  <span>Risks</span>
                  <strong>{result.risks.length}</strong>
                  <progress value={result.risks.length} max={maxCount} />
                </section>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
