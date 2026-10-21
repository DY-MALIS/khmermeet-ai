"use client";

import { useEffect, useState } from "react";
import { AI_WORKSPACE_PENDING_TRANSCRIPT_KEY } from "@/lib/ai-workspace-handoff";
import { readJsonResponse } from "@/lib/read-json-response";
import { useBilingualText } from "@/lib/display-language";

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

const tabs: Tab[] = ["overview", "notes", "tasks", "copilot", "timeline", "automation", "analytics"];

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function AIWorkspace() {
  const t = useBilingualText();
  const tabLabels: Record<Tab, string> = {
    overview: t("ទិដ្ឋភាពទូទៅ", "Overview"), notes: t("កំណត់ចំណាំ", "Notes"),
    tasks: t("កិច្ចការ", "Tasks"), copilot: t("ជំនួយការ", "Copilot"),
    timeline: t("លំដាប់ពេលវេលា", "Timeline"), automation: t("ស្វ័យប្រវត្តិកម្ម", "Automation"),
    analytics: t("វិភាគទិន្នន័យ", "Analytics")
  };
  const [transcript, setTranscript] = useState("");
  const [question, setQuestion] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [result, setResult] = useState<WorkspaceResult | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const pendingTranscript = sessionStorage.getItem(AI_WORKSPACE_PENDING_TRANSCRIPT_KEY);
    if (!pendingTranscript) return;
    sessionStorage.removeItem(AI_WORKSPACE_PENDING_TRANSCRIPT_KEY);
    setTranscript(pendingTranscript);
    void analyze(undefined, pendingTranscript);
    // Runs once on mount to pick up a transcript handed off from another page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyze(nextQuestion?: string, nextTranscript?: string) {
    const transcriptToAnalyze = nextTranscript ?? transcript;
    if (!transcriptToAnalyze.trim()) {
      setMessage(t("សូមបិទភ្ជាប់អត្ថបទប្រជុំជាមុនសិន។", "Paste a transcript first."));
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptToAnalyze, question: nextQuestion ?? question })
      });
      const data = await readJsonResponse<WorkspaceResult & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? t("ការវិភាគមិនជោគជ័យ។", "Analysis failed."));
      setResult(data);
      setMessage(data.provider === "openrouter" ? t("បានវិភាគដោយ AI។", "Analyzed with AI.") : t("បានវិភាគនៅក្នុងឧបករណ៍ ដោយមិនប្រើឥណទាន AI។", "Analyzed locally (no AI credits used)."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("ការវិភាគមិនជោគជ័យ។", "Analysis failed."));
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
    setMessage(t("បានចម្លងអ៊ីមែលតាមដាន។", "Follow-up email copied."));
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
          <p className="eyebrow">{t("កន្លែងធ្វើការប្រជុំ AI", "AI Meeting Workspace")}</p>
          <h1>{t("កន្លែងធ្វើការ AI", "AI Workspace")}</h1>
          <p>{t("បិទភ្ជាប់អត្ថបទប្រជុំ ដើម្បីទទួលបានទិដ្ឋភាពទូទៅ កិច្ចការ សេចក្ដីសម្រេច លំដាប់ពេលវេលា និងអ៊ីមែលតាមដាន។", "Paste any meeting transcript to get an instant overview, tasks, decisions, timeline, and follow-up email.")}</p>
        </div>
        <div className="score-block">
          <strong>{actionableCount}</strong>
          <span>{t("ធាតុដែលអាចអនុវត្តបាន", "Actionable items found")}</span>
        </div>
      </div>

      <div className="workspace-input">
        <label htmlFor="ai-workspace-transcript">{t("អត្ថបទប្រជុំ", "Transcript")}</label>
        <textarea
          id="ai-workspace-transcript"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder={t("បិទភ្ជាប់អត្ថបទប្រជុំនៅទីនេះ...", "Paste a meeting transcript here...")}
        />
        <div className="workspace-actions">
          <button className="primary" type="button" onClick={() => void analyze()} disabled={loading}>
            {loading ? t("កំពុងវិភាគ...", "Analyzing...") : t("វិភាគ", "Analyze")}
          </button>
          <button type="button" onClick={clearAll} disabled={loading}>
            {t("សម្អាត", "Clear")}
          </button>
        </div>
        {message ? <p className="workspace-message">{message}</p> : null}
      </div>

      {!result ? (
        <div className="workspace-empty">
          <strong>{t("មិនទាន់មានការវិភាគ", "No analysis yet")}</strong>
          <p>{t("បិទភ្ជាប់អត្ថបទខាងលើ រួចចុច វិភាគ ដើម្បីចាប់ផ្ដើម។", "Paste a transcript above and click Analyze to get started.")}</p>
        </div>
      ) : (
        <>
          <div className="workspace-tabs">
            {tabs.map((tabItem) => (
              <button key={tabItem} type="button" className={tab === tabItem ? "active" : ""} onClick={() => setTab(tabItem)}>
                {tabLabels[tabItem]}
              </button>
            ))}
          </div>

          <div className="workspace-results">
            {tab === "overview" ? (
              <section className="overview-band">
                <h2>{tabLabels.overview}</h2>
                <p>{result.overview || t("មិនមានទិដ្ឋភាពទូទៅ។", "No overview available.")}</p>
              </section>
            ) : null}

            {tab === "notes" ? (
              <div className="notes-grid">
                <div className="ai-note-section">
                  <h3>{t("សេចក្ដីសម្រេច", "Decisions")}</h3>
                  <ul>{result.decisions.length ? result.decisions.map((item, i) => <li key={i}>{item}</li>) : <li className="muted">{t("រកមិនឃើញ", "None found")}</li>}</ul>
                </div>
                <div className="ai-note-section">
                  <h3>{t("បញ្ហា និងហានិភ័យ", "Problems & Risks")}</h3>
                  <ul>
                    {[...result.problems, ...result.risks].length
                      ? [...new Set([...result.problems, ...result.risks])].map((item, i) => <li key={i}>{item}</li>)
                      : <li className="muted">{t("រកមិនឃើញ", "None found")}</li>}
                  </ul>
                </div>
                <div className="ai-note-section">
                  <h3>{t("គំនិត និងសំណួរ", "Ideas & Questions")}</h3>
                  <ul>
                    {[...result.ideas, ...result.questions].length
                      ? [...result.ideas, ...result.questions].map((item, i) => <li key={i}>{item}</li>)
                      : <li className="muted">{t("រកមិនឃើញ", "None found")}</li>}
                  </ul>
                </div>
              </div>
            ) : null}

            {tab === "tasks" ? (
              <section className="task-table">
                <h2>{tabLabels.tasks}</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("កិច្ចការ", "Task")}</th>
                        <th>{t("អ្នកទទួលខុសត្រូវ", "Assignee")}</th>
                        <th>{t("កាលកំណត់", "Deadline")}</th>
                        <th>{t("អាទិភាព", "Priority")}</th>
                        <th>{t("ស្ថានភាព", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.tasks.length ? (
                        result.tasks.map((task) => (
                          <tr key={task.id}>
                            <td>{task.title}</td>
                            <td>{task.assignee}</td>
                            <td>{task.deadline || "-"}</td>
                            <td>{task.priority === "low" ? t("ទាប", "Low") : task.priority === "medium" ? t("មធ្យម", "Medium") : task.priority === "high" ? t("ខ្ពស់", "High") : task.priority}</td>
                            <td>
                              <span className={`status ${task.status.replace(/_/g, "-")}`}>{task.status === "not_started" ? t("មិនទាន់ចាប់ផ្ដើម", "Not started") : task.status === "in_progress" ? t("កំពុងធ្វើ", "In progress") : task.status === "completed" ? t("រួចរាល់", "Completed") : task.status}</span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="muted">
                            {t("រកមិនឃើញកិច្ចការ។", "No tasks found.")}
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
                <h2>{tabLabels.copilot}</h2>
                <div className="copilot-input">
                  <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("សួរអំពីប្រជុំនេះ...", "Ask about this meeting...")} />
                  <button className="primary" type="button" onClick={() => void analyze(question)} disabled={loading || !question.trim()}>
                    {t("សួរ", "Ask")}
                  </button>
                </div>
                <div className="copilot-answer">{result.answer || t("សួរសំណួរខាងលើ ដើម្បីទទួលចម្លើយផ្អែកលើអត្ថបទប្រជុំ។", "Ask a question above to get an answer grounded in the transcript.")}</div>
              </section>
            ) : null}

            {tab === "timeline" ? (
              <section className="timeline-panel">
                <h2>{tabLabels.timeline}</h2>
                {result.timeline.length ? (
                  result.timeline.map((entry, index) => (
                    <div className="timeline-row" key={index}>
                      <time>{formatSeconds(entry.second)}</time>
                      <span>
                        <small>{t("ប្រធានបទ", "Topic")} {index + 1}</small>
                      </span>
                      <b>{entry.title.slice(0, 24)}</b>
                    </div>
                  ))
                ) : (
                  <p className="muted">{t("រកមិនឃើញលំដាប់ពេលវេលា។", "No timeline detected.")}</p>
                )}
              </section>
            ) : null}

            {tab === "automation" ? (
              <div className="automation-grid">
                <section>
                  <h2>{t("អ៊ីមែលតាមដាន", "Follow-up email")}</h2>
                  <textarea readOnly value={result.followUp} />
                  <div className="document-buttons">
                    <button type="button" onClick={() => void copyFollowUp()}>
                      {t("ចម្លង", "Copy")}
                    </button>
                    <button type="button" onClick={downloadFollowUp}>
                      {t("ទាញយក", "Download")}
                    </button>
                  </div>
                </section>
                <section>
                  <h2>{t("ទិន្នន័យវិភាគដើម (JSON)", "Raw analysis (JSON)")}</h2>
                  <code>{JSON.stringify(result, null, 2)}</code>
                </section>
              </div>
            ) : null}

            {tab === "analytics" ? (
              <div className="analytics-grid">
                <section>
                  <span>{t("សេចក្ដីសម្រេច", "Decisions")}</span>
                  <strong>{result.decisions.length}</strong>
                  <progress value={result.decisions.length} max={maxCount} />
                </section>
                <section>
                  <span>{tabLabels.tasks}</span>
                  <strong>{result.tasks.length}</strong>
                  <progress value={result.tasks.length} max={maxCount} />
                </section>
                <section>
                  <span>{t("ហានិភ័យ", "Risks")}</span>
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
