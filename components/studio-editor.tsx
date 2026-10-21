"use client";

import { CheckCircle2, Copy, History, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/components/ui";
import { ExportButton } from "@/components/export-button";
import { readJsonResponse } from "@/lib/read-json-response";
import { useBilingualText } from "@/lib/display-language";

type StageKind = "clean" | "translate" | "summarize";

type StudioVersion = { id: string; kind: string; content: string; createdAt: string };

type StudioProject = {
  id: string;
  title: string;
  rawTranscript: string;
  cleanTranscript: string;
  translatedText: string;
  summaryResult: string;
  sourceLanguage: string;
  targetLanguage: string;
  versions: StudioVersion[];
};

export function StudioEditor({ project }: { project: StudioProject }) {
  const t = useBilingualText();
  const sourceLanguageOptions = [
    { value: "auto", label: t("សម្គាល់ដោយស្វ័យប្រវត្តិ", "Auto-detect") },
    { value: "km", label: t("ភាសាខ្មែរ", "Khmer") },
    { value: "en", label: t("ភាសាអង់គ្លេស", "English") }
  ];
  const targetLanguageOptions = sourceLanguageOptions.slice(1);
  const stageLabels: Record<StageKind, { title: string; helper: string; button: string; success: string }> = {
    clean: {
      title: t("សម្អាតអត្ថបទប្រជុំ", "Clean transcript"),
      helper: t("កែសញ្ញាវណ្ណយុត្តិ ពាក្យបំពេញ និងទ្រង់ទ្រាយដោយមិនប្ដូរអត្ថន័យ។", "Fix punctuation, filler words, and formatting without changing the meaning."),
      button: t("សម្អាតអត្ថបទ", "Clean transcript"),
      success: t("បានសម្អាតអត្ថបទប្រជុំ។", "Transcript cleaned.")
    },
    translate: {
      title: t("បកប្រែ", "Translate"),
      helper: t("បកប្រែអត្ថបទដែលបានសម្អាត ឬអត្ថបទដើម ទៅភាសាគោលដៅ។", "Translate the clean transcript, or the raw transcript if it has not been cleaned, into the target language."),
      button: t("បកប្រែ", "Translate"),
      success: t("បានបកប្រែរួច។", "Translation complete.")
    },
    summarize: {
      title: t("សង្ខេប", "Summarize"),
      helper: t("បង្កើតសេចក្ដីសង្ខេប ចំណុចសំខាន់ សេចក្ដីសម្រេច កិច្ចការ និងជំហានបន្ទាប់។", "Create a summary with overview, key points, decisions, action items, and next steps."),
      button: t("សង្ខេប", "Summarize"),
      success: t("បានបង្កើតសេចក្ដីសង្ខេប។", "Summary created.")
    }
  };
  const router = useRouter();
  const [rawTranscript, setRawTranscript] = useState(project.rawTranscript);
  const [cleanTranscript, setCleanTranscript] = useState(project.cleanTranscript);
  const [translatedText, setTranslatedText] = useState(project.translatedText);
  const [summaryResult, setSummaryResult] = useState(project.summaryResult);
  const [sourceLanguage, setSourceLanguage] = useState(project.sourceLanguage || "auto");
  const [targetLanguage, setTargetLanguage] = useState(project.targetLanguage || "km");
  const [versions, setVersions] = useState(project.versions);
  const [savingRaw, setSavingRaw] = useState(false);
  const [runningAction, setRunningAction] = useState<StageKind | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const stageValue: Record<StageKind, string> = {
    clean: cleanTranscript,
    translate: translatedText,
    summarize: summaryResult
  };
  const stageSetter: Record<StageKind, (value: string) => void> = {
    clean: setCleanTranscript,
    translate: setTranslatedText,
    summarize: setSummaryResult
  };
  const stageField: Record<StageKind, string> = {
    clean: "cleanTranscript",
    translate: "translatedText",
    summarize: "summaryResult"
  };

  async function persistProject(fields: Record<string, unknown>) {
    const response = await fetch("/api/studio/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: project.id, ...fields })
    });
    const data = await readJsonResponse<{ error?: string }>(response);
    if (!response.ok) throw new Error(data.error ?? t("មិនអាចរក្សាទុកគម្រោងបានទេ។", "Could not save project."));
  }

  async function addVersion(kind: string, content: string) {
    const response = await fetch("/api/studio/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, kind, content })
    });
    const data = await readJsonResponse<{ version?: StudioVersion; error?: string }>(response);
    if (response.ok && data.version) setVersions((prev) => [data.version as StudioVersion, ...prev].slice(0, 50));
  }

  async function saveRawTranscript() {
    setSavingRaw(true);
    setMessage("");
    setError("");
    try {
      await persistProject({ rawTranscript });
      await addVersion("raw", rawTranscript);
      setMessage(t("បានរក្សាទុកអត្ថបទដើម។", "Raw transcript saved."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("មិនអាចរក្សាទុកអត្ថបទប្រជុំបានទេ។", "Could not save transcript."));
    } finally {
      setSavingRaw(false);
    }
  }

  async function runStage(action: StageKind) {
    const sourceText =
      action === "clean" ? rawTranscript : action === "translate" ? cleanTranscript || rawTranscript : cleanTranscript || translatedText || rawTranscript;
    if (!sourceText.trim()) {
      setError(t("សូមបញ្ចូលអត្ថបទប្រជុំជាមុនសិន។", "Enter a transcript first."));
      return;
    }
    setRunningAction(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/studio/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text: sourceText, sourceLanguage, targetLanguage })
      });
      const data = await readJsonResponse<{ result?: string; error?: string }>(response);
      if (!response.ok || !data.result) throw new Error(data.error ?? t("ការដំណើរការ AI មិនជោគជ័យ។", "AI processing failed."));

      stageSetter[action](data.result);
      await persistProject({ [stageField[action]]: data.result, sourceLanguage, targetLanguage });
      await addVersion(action, data.result);
      setMessage(stageLabels[action].success);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ការដំណើរការ AI មិនជោគជ័យ។", "AI processing failed."));
    } finally {
      setRunningAction(null);
    }
  }

  function restoreVersion(version: StudioVersion) {
    if (version.kind === "clean") setCleanTranscript(version.content);
    else if (version.kind === "translate") setTranslatedText(version.content);
    else if (version.kind === "summarize") setSummaryResult(version.content);
    else setRawTranscript(version.content);
    setMessage(t("បានស្ដារកំណែមុន។ សូមចុចរក្សាទុកដើម្បីទុកវា។", "Previous version restored. Click Save to keep it."));
  }

  async function copyText(value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setMessage(t("បានចម្លងលទ្ធផល។", "Result copied."));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="kh-card space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t("អត្ថបទប្រជុំដើម", "Raw transcript")}</h2>
            <ExportButton title={project.title} transcript={cleanTranscript || rawTranscript} summary={summaryResult} />
          </div>
          <textarea
            className="kh-input min-h-72 bg-white leading-7"
            value={rawTranscript}
            onChange={(event) => setRawTranscript(event.target.value)}
            placeholder={t("បិទភ្ជាប់ ឬវាយអត្ថបទប្រជុំនៅទីនេះ...", "Paste or type the transcript here...")}
          />
          <button className="kh-button-primary" type="button" disabled={savingRaw} onClick={() => void saveRawTranscript()}>
            {savingRaw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("រក្សាទុកអត្ថបទដើម", "Save raw transcript")}
          </button>
        </section>

        <section className="kh-card space-y-4 p-5">
          <h2 className="text-lg font-bold">{t("ការកំណត់ភាសា", "Language settings")}</h2>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">{t("ភាសាដើម", "Source language")}</span>
            <select className="kh-input bg-white" value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
              {sourceLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">{t("ភាសាគោលដៅ", "Target language")}</span>
            <select className="kh-input bg-white" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
              {targetLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-5 text-slate-500">{t("ភាសាគោលដៅត្រូវបានប្រើសម្រាប់ការបកប្រែ និងសង្ខេប។", "Target language applies to Translate and Summarize.")}</p>
        </section>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? (
        <p className="flex items-start gap-2 rounded-lg bg-leaf/10 p-3 text-sm text-leaf">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {(Object.keys(stageLabels) as StageKind[]).map((stage) => (
          <section key={stage} className="kh-card space-y-3 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
              <Sparkles className="h-4 w-4" />
              {stageLabels[stage].title}
            </p>
            <p className="text-xs leading-5 text-slate-500">{stageLabels[stage].helper}</p>
            <button
              className="kh-button-primary w-full justify-center"
              type="button"
              disabled={runningAction !== null}
              onClick={() => void runStage(stage)}
            >
              {runningAction === stage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {stageLabels[stage].button}
            </button>
            <textarea
              className="kh-input min-h-48 bg-white leading-7"
              value={stageValue[stage]}
              onChange={(event) => stageSetter[stage](event.target.value)}
              placeholder={t("លទ្ធផលនឹងបង្ហាញនៅទីនេះ...", "Results will appear here...")}
            />
            <button
              className="kh-button-secondary w-full justify-center"
              type="button"
              disabled={!stageValue[stage].trim()}
              onClick={() => void copyText(stageValue[stage])}
            >
              <Copy className="h-4 w-4" />
              {t("ចម្លង", "Copy")}
            </button>
          </section>
        ))}
      </div>

      <section className="kh-card p-5">
        <p className="mb-4 flex items-center gap-2 text-lg font-bold">
          <History className="h-4 w-4 text-leaf" />
          {t("ប្រវត្តិកំណែ", "Version history")}
        </p>
        {versions.length ? (
          <div className="space-y-2">
            {versions.map((version) => (
              <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-3">
                  <span className={cn("kh-badge", version.kind === "raw" ? "bg-slate-100 text-slate-600" : "bg-sky/10 text-sky")}>
                    {version.kind === "raw" ? t("ដើម", "raw") : version.kind === "clean" ? t("សម្អាត", "clean") : version.kind === "translate" ? t("បកប្រែ", "translated") : t("សង្ខេប", "summary")}
                  </span>
                  <span className="text-sm text-slate-500">{new Date(version.createdAt).toLocaleString()}</span>
                </div>
                <button className="kh-button-secondary" type="button" onClick={() => restoreVersion(version)}>
                  <RotateCcw className="h-4 w-4" />
                  {t("ស្ដារ", "Restore")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("មិនទាន់មានកំណែ។ រាល់ការរក្សាទុក ឬសកម្មភាព AI នឹងបង្កើតកំណែថ្មី។", "No versions yet. Each save or AI action will create a new version.")}</p>
        )}
      </section>
    </div>
  );
}
