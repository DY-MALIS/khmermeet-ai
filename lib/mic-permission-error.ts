import type { DisplayLanguage } from "@/lib/navigation-labels";

export function describeMicError(error: unknown, language: DisplayLanguage = "km"): string {
  const name = error instanceof DOMException ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return language === "en"
        ? "Microphone access was denied. Allow the microphone in your browser's site settings, then reload this page."
        : "Browser បានបដិសេធសិទ្ធិប្រើ microphone។ សូមចុចរូប padlock/site settings នៅជិត address bar រួចអនុញ្ញាត Microphone ឡើងវិញ, រួចផ្ទុកទំព័រនេះម្តងទៀត។";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return language === "en"
        ? "No microphone was found. Connect one or check that your device's microphone is working."
        : "រកមិនឃើញ microphone ទេ។ សូមភ្ជាប់ microphone ឬពិនិត្យមើលថាកុំព្យូទ័ររបស់អ្នកមាន microphone ដំណើរការត្រឹមត្រូវ។";
    case "NotReadableError":
    case "TrackStartError":
      return language === "en"
        ? "Another app may be using the microphone, such as Zoom or Teams. Close that app and try again."
        : "Microphone កំពុងប្រើដោយកម្មវិធីផ្សេង (ដូចជា Zoom, Teams) ។ សូមបិទកម្មវិធីនោះ រួចសាកល្បងម្តងទៀត។";
    case "SecurityError":
      return language === "en"
        ? "The browser blocked microphone access on this page. Open it directly in a regular browser tab."
        : "Browser បិទសិទ្ធិប្រើ microphone លើទំព័រនេះ (security policy)។ សូមបើកទំព័រនេះដោយផ្ទាល់ក្នុង tab ធម្មតា មិនមែនក្នុង iframe ឬ in-app browser ទេ។";
    default:
      return language === "en"
        ? "Could not open the microphone. Allow browser access and try a current version of Chrome, Edge, or Safari."
        : "មិនអាចបើក microphone បានទេ។ សូមចុច Allow ក្នុង browser permission, ប្រើ Chrome/Edge/Safari ថ្មីៗ, ហើយកុំបើកក្នុង Facebook/Telegram in-app browser។";
  }
}
