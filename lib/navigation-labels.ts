export type DisplayLanguage = "km" | "en";

export const languageNames: Record<DisplayLanguage, string> = {
  km: "ខ្មែរ",
  en: "English"
};

export const navigationLabels = {
  km: {
    dashboard: "ផ្ទាំងគ្រប់គ្រង",
    meetings: "ប្រជុំ",
    recorder: "ថតសំឡេង",
    transcript: "អត្ថបទប្រជុំ",
    aiSummary: "សង្ខេបដោយ AI",
    studio: "Scribe Studio",
    tasks: "កិច្ចការ",
    history: "ប្រវត្តិ",
    settings: "ការកំណត់",
    language: "ភាសា",
    localMode: "របៀប Local MVP",
    aiWorkspace: "AI Workspace"
  },
  en: {
    dashboard: "Dashboard",
    meetings: "Meetings",
    recorder: "Recorder",
    transcript: "Transcript",
    aiSummary: "AI Summary",
    studio: "Scribe Studio",
    tasks: "Tasks",
    history: "History",
    settings: "Settings",
    language: "Language",
    localMode: "Local MVP mode",
    aiWorkspace: "AI Workspace"
  }
} satisfies Record<DisplayLanguage, Record<string, string>>;
