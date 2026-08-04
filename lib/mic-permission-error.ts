export function describeMicError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Browser បានបដិសេធសិទ្ធិប្រើ microphone។ សូមចុចរូប padlock/site settings នៅជិត address bar រួចអនុញ្ញាត Microphone ឡើងវិញ, រួចផ្ទុកទំព័រនេះម្តងទៀត។";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "រកមិនឃើញ microphone ទេ។ សូមភ្ជាប់ microphone ឬពិនិត្យមើលថាកុំព្យូទ័ររបស់អ្នកមាន microphone ដំណើរការត្រឹមត្រូវ។";
    case "NotReadableError":
    case "TrackStartError":
      return "Microphone កំពុងប្រើដោយកម្មវិធីផ្សេង (ដូចជា Zoom, Teams) ។ សូមបិទកម្មវិធីនោះ រួចសាកល្បងម្តងទៀត។";
    case "SecurityError":
      return "Browser បិទសិទ្ធិប្រើ microphone លើទំព័រនេះ (security policy)។ សូមបើកទំព័រនេះដោយផ្ទាល់ក្នុង tab ធម្មតា មិនមែនក្នុង iframe ឬ in-app browser ទេ។";
    default:
      return "មិនអាចបើក microphone បានទេ។ សូមចុច Allow ក្នុង browser permission, ប្រើ Chrome/Edge/Safari ថ្មីៗ, ហើយកុំបើកក្នុង Facebook/Telegram in-app browser។";
  }
}
