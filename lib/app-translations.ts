export type AppLanguage = "km" | "en";

export const kmToEnText: Record<string, string> = {
  "ខ្មែរ": "Khmer",
  "ភាសា": "Language",
  "របៀប Local MVP": "Local MVP mode",
  "ផ្ទាំងគ្រប់គ្រង": "Dashboard",
  "ប្រជុំ": "Meetings",
  "ថតសំឡេង": "Recorder",
  "អត្ថបទប្រជុំ": "Transcript",
  "សង្ខេបដោយ AI": "AI Summary",
  "កិច្ចការ": "Tasks",
  "ប្រវត្តិ": "History",
  "ការកំណត់": "Settings",

  "សូមស្វាគមន៍": "Welcome",
  "មុខងារសំខាន់": "Main feature",
  "ចាប់ផ្តើមថតប្រជុំ": "Start Recording Meeting",
  "ថតសំឡេងប្រជុំ, បញ្ចូល transcript, បង្កើតសង្ខេបដោយ AI និងដកស្រង់ action items។":
    "Record meeting audio, add a transcript, generate an AI summary, and extract action items.",
  "បើកប្រជុំវីដេអូ": "Start Video Meeting",
  "ចូល video call ហើយឲ្យ Meeting Agent ថតសំឡេង និងរក្សា transcript ស្វ័យប្រវត្តិ។":
    "Join a video call and let Meeting Agent record audio and save the transcript automatically.",
  "ប្រជុំសរុប": "Total meetings",
  "កិច្ចការសរុប": "Total tasks",
  "បានបញ្ចប់": "Completed",
  "ហួសកំណត់": "Overdue",
  "ប្រជុំថ្មីៗ": "Recent meetings",
  "កិច្ចការកំពុងរង់ចាំ": "Pending action items",
  "មិនទាន់មានប្រជុំ": "No meetings yet",
  "មិនទាន់មានកិច្ចការ": "No tasks yet",

  "ប្រជុំថ្មី": "New Meeting",
  "ថតសំឡេងប្រជុំ": "Meeting Recorder",
  "ថតសំឡេងក្នុង browser, ស្តាប់ preview, រួចរក្សាទុក meeting ទៅ local database។":
    "Record audio in the browser, preview it, then save the meeting to the local database.",
  "ពេលវេលាថតសំឡេង": "Recording time",
  "រួចរាល់សម្រាប់ថត": "Ready to record",
  "ចាប់ផ្តើមថត": "Start recording",
  "ផ្អាក": "Pause",
  "បន្ត": "Resume",
  "បញ្ឈប់": "Stop",
  "ស្តាប់សំឡេងដែលបានថត": "Listen to the recording",
  "ចំណងជើងប្រជុំ": "Meeting title",
  "រក្សាទុកប្រជុំ": "Save meeting",
  "បោះចោល": "Discard",
  "ថតម្តងទៀត": "Record again",

  "ប្រជុំវីដេអូ": "Video Meeting",
  "បើក video call ជាច្រើននាក់សម្រាប់ local MVP និងសាកល្បងក្នុង browser tabs។":
    "Start a multi-person video call for the local MVP and test across browser tabs.",
  "ឈ្មោះអ្នកចូលរួម": "Participant name",
  "អ្នកចូលក្រោយអាចបើកទំព័រ Video Call, វាយ room code នេះ, រួចចុច “ចូល Video Call”។":
    "Later participants can open the Video Call page, enter this room code, then click “Join Video Call.”",
  "ចូល Video Call": "Join Video Call",
  "ចាកចេញ": "Leave",
  "ថតសំឡេង សរសេរ transcript និងរក្សាស្វ័យប្រវត្តិ": "Record audio, write transcript, and auto-save",
  "Agent នឹងថត audio ពេល video call, សរសេរ transcript បើ browser គាំទ្រ, រួចបង្កើត meeting summary និង tasks។":
    "Agent records audio during the video call, writes a transcript if supported, then creates a meeting summary and tasks.",
  "មិនទាន់ចូល Video Call": "Not in a video call yet",
  "ចុច “ចូល Video Call” ហើយអនុញ្ញាត camera និង microphone។":
    "Click “Join Video Call” and allow camera and microphone.",
  "កំពុងរក្សាទុក...": "Saving...",
  "សូមបញ្ចូល room code។": "Please enter a room code.",
  "មិនអាចបើក camera/microphone បានទេ។ សូមចុច Allow ហើយសាកល្បងម្តងទៀត។":
    "Cannot open camera/microphone. Please click Allow and try again.",
  "សូមចូល Video Call មុនពេលចាប់ផ្តើម Agent recording។":
    "Please join the video call before starting Agent recording.",
  "Browser នេះមិនគាំទ្រ MediaRecorder ទេ។": "This browser does not support MediaRecorder.",
  "មិនមាន audio track សម្រាប់ថតទេ។": "There is no audio track to record.",
  "Agent កំពុងថតសំឡេង និងសរសេរ transcript ស្វ័យប្រវត្តិ។":
    "Agent is recording audio and writing the transcript automatically.",
  "Speech-to-text មិនដំណើរការល្អនៅ browser នេះទេ។ Agent នឹងរក្សា audio ហើយអ្នកអាចកែ transcript បន្ថែមបាន។":
    "Speech-to-text is not working well in this browser. Agent will save the audio and you can edit the transcript later.",
  "Browser នេះមិនគាំទ្រ live speech-to-text ទេ។ Agent នឹងថត audio ហើយរក្សា transcript ដែលអ្នកបញ្ចូលដោយដៃ។":
    "This browser does not support live speech-to-text. Agent will record audio and save the transcript you enter manually.",
  "Agent កំពុង upload audio និងរក្សា meeting record...": "Agent is uploading audio and saving the meeting record...",
  "Agent បានរក្សា audio, transcript, summary និង tasks រួចរាល់។":
    "Agent saved the audio, transcript, summary, and tasks.",
  "Agent មិនអាចរក្សា meeting បានទេ។ សូមសាកល្បងម្តងទៀត។":
    "Agent could not save the meeting. Please try again.",
  "Room code ត្រូវបាន copy រួច។ អ្នកចូលក្រោយអាចវាយ code នេះក្នុងទំព័រ Video Call។":
    "Room code copied. Later participants can enter this code on the Video Call page.",

  "មើលអក្សរដែលបានបម្លែងពីសំឡេង ឬបានបញ្ចូលដោយ Meeting Agent។":
    "View text converted from audio or entered by Meeting Agent.",
  "មិនទាន់មានអត្ថបទប្រជុំ": "No transcripts yet",
  "សង្ខេបប្រជុំ, ចំណុចសំខាន់ៗ, ការសម្រេចចិត្ត និងកិច្ចការដែលត្រូវធ្វើ។":
    "Meeting summary, key points, decisions, and action items.",
  "សង្ខេបប្រជុំ និងចំណុចសំខាន់ៗ": "Meeting summary and key points",
  "កិច្ចការដែលត្រូវធ្វើ": "Action items",
  "មិនទាន់មានសង្ខេបដោយ AI": "No AI summaries yet",

  "តាមដានអ្នកទទួលខុសត្រូវ, deadline និងស្ថានភាពការងារ។":
    "Track assignees, deadlines, and work status.",
  "គ្រប់ស្ថានភាព": "All statuses",
  "មិនទាន់ចាប់ផ្តើម": "Not started",
  "កំពុងធ្វើ": "In progress",
  "រួច": "Completed",
  "គ្រប់អាទិភាព": "All priorities",
  "ទាំងអស់": "All",
  "អ្នកទទួលខុសត្រូវ": "Assignee",
  "អាទិភាព": "Priority",
  "ស្ថានភាព": "Status",
  "រក្សាទុក": "Save",
  "លុប": "Delete",
  "រកមិនឃើញកិច្ចការ": "No tasks found",

  "ប្រវត្តិប្រជុំ": "Meeting History",
  "រកមើលកិច្ចប្រជុំ": "Browse meetings",
  "ស្វែងរក": "Search",
  "ស្វែងរកតាមចំណងជើង": "Search by title",
  "រកមិនឃើញប្រជុំ": "No meetings found",
  "ព័ត៌មានប្រជុំ": "Meeting details",
  "រក្សាទុក transcript": "Save transcript",
  "មិនទាន់មាន summary": "No summary yet",

  "គណនី និងភាសា": "Account and language",
  "ភាសាបង្ហាញ": "Display language",
  "Display language / ភាសាបង្ហាញ": "Display language",
  "ជ្រើស Khmer ឬ English ដើម្បីប្តូរ menu label សំខាន់ៗក្នុង app។":
    "Choose Khmer or English to switch the app labels.",
  "ព័ត៌មានគណនី": "Account info",
  "ឈ្មោះ": "Name",
  "អ៊ីមែល": "Email",
  "ការភ្ជាប់ប្រព័ន្ធ": "Integrations",
  "ឆាប់ៗនេះ": "Soon"
};

export const enToKmText = Object.fromEntries(Object.entries(kmToEnText).map(([km, en]) => [en, km])) as Record<string, string>;
