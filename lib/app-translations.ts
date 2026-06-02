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
  "ឆាប់ៗនេះ": "Soon",

  "MVP នេះប្រើ WebRTC + BroadcastChannel សម្រាប់ local multi-person call។ ដើម្បីសាកល្បងច្រើននាក់ សូម copy invite ហើយបើកក្នុង browser tab/window ផ្សេងៗលើ machine នេះ។ សម្រាប់ call ឆ្លងកាត់ internet ពិតៗ ត្រូវបន្ថែម signaling server និង TURN server។":
    "This MVP uses WebRTC + BroadcastChannel for local multi-person calls. To test with multiple people, copy the invite and open it in another browser tab/window on this machine. For real internet calls, add a signaling server and TURN server.",
  "Agent transcript នឹងបង្ហាញនៅទីនេះ។ អ្នកក៏អាចវាយកំណត់ត្រាបន្ថែមដោយដៃបាន។":
    "Agent transcript will appear here. You can also type extra notes manually.",

  "ប្រជុំផែនការផលិតផល Q2": "Q2 Product Planning Meeting",
  "សុខា នឹងរៀបចំផែនការផលិតផលនៅថ្ងៃសុក្រ។ ដារ៉ា ត្រូវត្រួតពិនិត្យ budget មុនថ្ងៃទី 2026-05-20។ ក្រុមសម្រេចចាប់ផ្តើម MVP នៅសប្តាហ៍ក្រោយ។":
    "Sokha will prepare the product plan on Friday. Dara must review the budget before 2026-05-20. The team decided to start the MVP next week.",
  "ក្រុមបានពិភាក្សាអំពីផែនការ MVP និងការរៀបចំការងារ Q2.": "The team discussed the MVP plan and Q2 work setup.",
  "- រៀបចំ product plan\n- ពិនិត្យ budget\n- ចាប់ផ្តើម MVP សប្តាហ៍ក្រោយ":
    "- Prepare the product plan\n- Review the budget\n- Start the MVP next week",
  "រៀបចំ product plan": "Prepare product plan",
  "ពិនិត្យ budget": "Review budget",
  "- រៀបចំ product plan": "- Prepare the product plan",
  "- ពិនិត្យ budget": "- Review the budget",
  "- ចាប់ផ្តើម MVP សប្តាហ៍ក្រោយ": "- Start the MVP next week",
  "ចាប់ផ្តើម MVP សប្តាហ៍ក្រោយ": "Start the MVP next week",
  "សុខា": "Sokha",
  "ដារ៉ា": "Dara",
  "30 នាទី": "30 min",
  "នាទី": "min",
  "high": "High",
  "medium": "Medium",
  "low": "Low"
};

Object.assign(kmToEnText, {
  "ចម្លង link": "Copy link",
  "ចែករំលែក invite": "Share invite",
  "ចម្លង invite": "Copy invite",
  "អញ្ជើញអ្នកចូលរួម": "Invite participants",
  "ចូល HD Video Call": "Join HD Video Call",
  "ចាប់ផ្តើម Agent": "Start Agent",
  "បញ្ឈប់ និងរក្សាទុក": "Stop & Save",
  "ថតដោយ Server": "Server Rec",
  "បញ្ឈប់ការថត Server": "Stop Server Rec",
  "បើកកំណត់ត្រា": "Open record",
  "ការថតត្រូវបានរក្សាទុកដោយជោគជ័យ": "Recording saved successfully",
  "ការថតដែលបានរក្សាទុក": "Saved recordings",
  "សំឡេង backup ក្នុង browser": "Local recording backup",
  "ស្តាប់សំឡេងដែលបានថត": "Recorded audio preview",
  "ភាសា transcript": "Transcript language",
  "ខ្មែរ និង English": "Mixed Khmer / English",
  "ខ្មែរ និងអង់គ្លេស": "Mixed KH/EN",
  "ខ្មែរតែប៉ុណ្ណោះ": "Khmer only",
  "English តែប៉ុណ្ណោះ": "English only",
  "បម្លែងសំឡេងជា transcript": "Transcribe audio",
  "បង្កើតកិច្ចការពី transcript": "Extract Action Tasks",
  "បង្កើតកិច្ចការម្តងទៀត": "Extract tasks again",
  "បង្កើតសង្ខេបម្តងទៀត": "Regenerate summary",
  "នាំចេញអត្ថបទ": "Export text",
  "បើកប្រជុំ": "Open meeting",
  "ត្រៀមរួច": "Ready",
  "កំពុងថត": "Recording",
  "កំពុងរក្សាទុក": "Saving",
  "ចុច link នេះឲ្យអ្នកផ្សេងចូលរួម": "Share this link so others can join",
  "ពួកគេវាយតែឈ្មោះប៉ុណ្ណោះ": "They only enter their name.",
  "អ្នកត្រូវបានអញ្ជើញចូលប្រជុំ": "You have been invited to a meeting",
  "អ្នកចូលរួម": "participants",
  "បន្ទប់": "Room",
  "ចំណងជើង": "Title",
  "កូដបន្ទប់": "Room code",
  "អនុញ្ញាតកាមេរ៉ា និងមីក្រូហ្វូន": "allow camera and microphone",
  "បើកកាមេរ៉ាពេលចូល": "Enable camera on join",
  "បើក microphone ពេលចូល": "Enable microphone on join",
  "បើក microphone": "Enable microphone",
  "បិទ microphone": "Mute",
  "បិទកាមេរ៉ា": "Camera off",
  "ចែករំលែកអេក្រង់": "Share screen",
  "ជជែក": "Chat",
  "ចាកចេញ": "Leave",
  "តម្រង": "Filter",
  "តែហួសកំណត់": "Overdue only",
  "សម្អាតតម្រង": "Clear filters",
  "គ្មានកិច្ចការតាមតម្រង": "No tasks match the current filters",
  "មិនមាន transcript ច្បាស់": "No clear transcript yet",
  "សូមបម្លែងសំឡេង ឬបញ្ចូល transcript ជាមុន": "Please transcribe audio or enter a transcript first",
  "Room code ត្រូវបានភ្ជាប់ក្នុង invite link រួចហើយ។ សូមវាយតែឈ្មោះរបស់អ្នក បន្ទាប់មកចុច Join HD Video Call។":
    "Room code is already included in the invite link. Enter only your name, then click Join HD Video Call.",
  "Host បំពេញចំណងជើង និង room code មុន។ Invite link នឹងផ្ញើចំណងជើង/room code ជាស្រេច។":
    "The host fills in the meeting title and room code first. The invite link already includes both.",
  "LiveKit mode គាំទ្រ audio/video ជាក្រុម, grid view, screen share, chat, speaker output និងសមស្របជាង WebRTC mesh សម្រាប់ 10-20 នាក់។ ប្រសិនបើអ្នកមិនមាន camera អ្នកអាចបិទវាបាន ហើយនៅតែនិយាយនិងស្តាប់តាម microphone បាន។ ប្រើ participantsបើកការអនុញ្ញាត, ចុចប៊ូតុង icon camera ក្នុង toolbar ខាងក្រោម call ហើយជ្រើស Allow នៅ browser permission។":
    "LiveKit mode supports team audio/video, grid view, screen share, chat, speaker output, and works better than WebRTC mesh for 10-20 people. If you do not have a camera, you can turn it off and still talk and listen through the microphone. Participants should allow permissions, use the camera icon in the lower toolbar, and choose Allow in the browser permission dialog.",
  "មិនទាន់មាន transcript ពិត": "No real transcript yet",
  "Audio ត្រូវបានsave ប៉ុន្តែមិនទាន់បម្លែងជាអក្សរច្បាស់។ ប្រាសិនបើមានលេខ timestampៗ បើក meeting detail ដើម្បីបម្លែង transcript ពិត។":
    "Audio is saved, but it has not been converted into clear text yet. If you only see timestamp-like text, open the meeting detail and transcribe the audio.",
  "បង្កើតកិច្ចការថ្មី": "Add new task",
  "ប្រើ AI មិនចាំបាច់ក៏បាន ប៉ុន្តែអ្នកអាចបង្កើតដោយដៃនៅទីនេះ។":
    "AI is optional. You can also create tasks manually here.",
  "ចំណងជើងកិច្ចការ": "Task title",
  "ពិពណ៌នាកិច្ចការ...": "Task description...",
  "រកមិនឃើញកិច្ចការតាម filter": "No tasks match the current filter",
  "សូមចុច Show all ឬប្ដូរ filter ដើម្បីមើលកិច្ចការផ្សេងៗ។":
    "Click Show all or change the filter to see other tasks.",
  "កិច្ចការដែល AI ដកស្រង់ ឬអ្នកបង្កើតដោយដៃ នឹងបង្ហាញនៅទីនេះ។":
    "Tasks extracted by AI or created manually will appear here.",
  "មិនទាន់មានកិច្ចការ": "No tasks yet",
  "ចុចប៊ូតុងខាងក្រោម ដើម្បីឲ្យ AI ទាញកិច្ចការពី transcript។":
    "Click the button below to let AI extract tasks from the transcript.",
  "ត្រូវមាន transcript ពិតជាមុនសិន ទើប AI អាចទាញកិច្ចការបាន។":
    "A real transcript is required before AI can extract tasks.",
  "សង្ខេបប្រជុំ": "Meeting summary",
  "ចំណុចសំខាន់ៗ": "Key points",
  "ការសម្រេចចិត្ត": "Decisions",
  "កិច្ចការដែលត្រូវធ្វើ": "Action items"
});

export const enToKmText = Object.fromEntries(Object.entries(kmToEnText).map(([km, en]) => [en, km])) as Record<string, string>;

export const phraseTranslationKeys = [
  "MVP នេះប្រើ WebRTC + BroadcastChannel សម្រាប់ local multi-person call។ ដើម្បីសាកល្បងច្រើននាក់ សូម copy invite ហើយបើកក្នុង browser tab/window ផ្សេងៗលើ machine នេះ។ សម្រាប់ call ឆ្លងកាត់ internet ពិតៗ ត្រូវបន្ថែម signaling server និង TURN server។",
  "Agent transcript នឹងបង្ហាញនៅទីនេះ។ អ្នកក៏អាចវាយកំណត់ត្រាបន្ថែមដោយដៃបាន។",
  "ប្រជុំផែនការផលិតផល Q2",
  "សុខា នឹងរៀបចំផែនការផលិតផលនៅថ្ងៃសុក្រ។ ដារ៉ា ត្រូវត្រួតពិនិត្យ budget មុនថ្ងៃទី 2026-05-20។ ក្រុមសម្រេចចាប់ផ្តើម MVP នៅសប្តាហ៍ក្រោយ។",
  "ក្រុមបានពិភាក្សាអំពីផែនការ MVP និងការរៀបចំការងារ Q2.",
  "- រៀបចំ product plan",
  "- ពិនិត្យ budget",
  "- ចាប់ផ្តើម MVP សប្តាហ៍ក្រោយ",
  "រៀបចំ product plan",
  "ពិនិត្យ budget",
  "ចាប់ផ្តើម MVP សប្តាហ៍ក្រោយ",
  "សុខា",
  "ដារ៉ា",
  "30 នាទី",
  "នាទី"
] as const;
