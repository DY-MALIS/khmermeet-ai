# របាយការណ៍ត្រួតពិនិត្យគុណភាពចុងក្រោយ — KhmerMeet AI

កាលបរិច្ឆេទ៖ 20 វិច្ឆិកា 2026។ ការត្រួតពិនិត្យនេះធ្វើលើកូដក្នុង `.push-repo` ប៉ុណ្ណោះ។ មិនបាន deploy, push, បង្កើតការទូទាត់ពិត ឬកែទិន្នន័យអតិថិជនទេ។ ពាក្យ **PASS** ខាងក្រោមប្រើតែសម្រាប់តេស្តដែលបានដំណើរការជោគជ័យ។

## 1. សេចក្តីសង្ខេប

ការកែប្រែក្នុងស្រុកពង្រឹងការអនុម័តការទូទាត់ដោយដៃ ការគណនារយៈពេលគម្រោង ការរក្សាទុកសំឡេងពេល upload បរាជ័យ និងការដកស្រង់ AI ដែលមានភស្តុតាងពី transcript។ TypeScript, ESLint, production build និង unit tests 56/56 ឆ្លងកាត់។ `ffmpeg-static` binary ខ្វះក្នុង local install ដំបូង; បានដំឡើងឡើងវិញ ហើយតេស្តសំឡេងទាំង 4 ឆ្លងកាត់។

**មិនទាន់រួចរាល់សម្រាប់ការប្រកាសថា paid LiveKit usage មានសុវត្ថិភាពពេញលេញទេ**៖ ការកំណត់ម៉ោងនៅពឹង browser heartbeat។ RLS migration ក៏មិនទាន់បានអនុវត្ត និងសាកល្បងលើ sandbox database ដែរ។

## 2. មុខងារដែលបានពិនិត្យ

បានតាមដាន Supabase Auth និង Prisma ownership, API routes, Stripe និង manual QR billing, quotas, LiveKit session metering, browser recording និង direct Storage upload, transcription/summary/action extraction, meeting history, export routes, និង Settings integrations។ Google Calendar, Telegram, Slack និង Zoom នៅជា `Soon`; គ្មាន OAuth ឬ provider routes សម្រាប់មុខងារទាំងនេះ។ ព័ត៌មានលម្អិតនៅ [integrations-audit.md](integrations-audit.md)។

## 3. បញ្ហាបញ្ជាក់ និងមូលហេតុ

| កម្រិត | ទីតាំង / function | ភស្តុតាង និងមូលហេតុ | ស្ថានភាព / ដំណោះស្រាយ |
| --- | --- | --- | --- |
| Critical | `prisma/migrations/20261120010000_protect_public_app_tables/migration.sql` | ការត្រួតពិនិត្យ Supabase មុននេះបានបញ្ជាក់ថា anon/authenticated អាចអាន និងកែតារាង public ចំនួន 10 ព្រោះ RLS បិទ។ `AudioFile` ក៏ជាតារាង public ដែល migration ដំបូងមិនបានរាប់បញ្ចូល។ | បានបន្ថែម `AudioFile` ក្នុង migration។ ត្រូវពិនិត្យ Data API consumers, អនុវត្តក្នុង sandbox, សាកល្បង anon/authenticated denial និង Prisma server access មុន production។ |
| High | `app/api/billing/live-usage/route.ts` / `POST` | ការគិតម៉ោង LiveKit កើតឡើងតែពេល client ផ្ញើ heartbeat; client អាចឈប់ផ្ញើ ហើយបន្តនៅក្នុងបន្ទប់។ | នៅបើក។ ត្រូវមាន LiveKit webhook, server-side metering និង disconnect ពេលអស់ quota។ |
| Medium | `components/recording-panel.tsx` / `uploadAndSaveRecording` | ពេល upload បរាជ័យ browser មាន blob សំឡេង ប៉ុន្តែមិនមានប៊ូតុង retry; refresh អាចបាត់ blob។ | បានបន្ថែម retry, progress និង before-unload warning។ ការរក្សាទុកក្រោយ refresh មិនទាន់មាន។ |
| Medium | `lib/ai/openrouter.ts` / `generateMeetingSummary`, `extractMeetingTasks` | ពេលគ្មាន AI key កូដចាស់អាចបង្កើត summary/task ទូទៅដែល transcript មិនគាំទ្រ។ ការដក task ម្តងទៀតអាចបង្កើតស្ទួន។ | បានបដិសេធការបង្កើតពេលគ្មាន key, បញ្ជាក់ completion, ទាមទារ source excerpt និងច្រោះ task ស្ទួន។ ការបញ្ជាក់ source ដោយ string match មិនធានាថាការបកស្រាយត្រឹមត្រូវទេ។ |
| Medium | `lib/billing-period.ts` / `manualPeriodEnd` និង `lib/billing-plans.ts` / price mapping | `Date.setUTCMonth()` អាចលោតខែពេលចាប់ផ្តើមចុងខែ; price mapping ចាស់អាចផ្តល់ entitlement ខុស tier។ | បានកែ និងមាន unit tests សម្រាប់ខែចុង/Stripe prices។ |

## 4. ការកែប្រែ និងសុវត្ថិភាព

- Manual QR submit/review/grant និង unlimited changes ប្រើ server authentication/administrator check, input validation, per-user transaction lock និង billing audit events។ ការអនុម័ត payment ដដែលត្រូវបដិសេធក្រោយ status មិនមែន `pending`។
- RLS migration គ្របតារាង app ដែលនៅខ្វះ រួមទាំង `AudioFile`; audit table migration បើក RLS សម្រាប់កំណត់ហេតុ។ មិនទាន់អនុវត្ត migration ទាំងនេះលើ database ទេ។
- Usage period និង expiry logic ត្រូវបានកែ; transcript source ត្រូវបានរក្សាទុកសម្រាប់ decisions/tasks និងសង្ខេបត្រូវមានផ្នែកសំខាន់ទាំងអស់។
- មិនបានប្ដូរតម្លៃគម្រោង ឬទិន្នន័យ billing អតិថិជន។

## 5. តេស្តដែលបានដំណើរការ

| តេស្ត | លទ្ធផល | ព្រំដែននៃភស្តុតាង |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | TypeScript compiler ចេញ code 0។ |
| `npm.cmd run lint` | PASS | ESLint ចេញ code 0។ |
| `node node_modules/next/dist/bin/next build` | PASS | Compile និង static page generation 27/27 ឆ្លងកាត់; ពុំបានរត់ script `npm run build` ដែលកែ schema។ |
| `npm.cmd test` | 56 PASS, 0 FAIL | បន្ទាប់ពី `npm.cmd rebuild ffmpeg-static`; រួមទាំងតេស្ត FFmpeg 4។ |
| `node scripts/evaluate-meeting-quality.mjs .quality-synthetic.json` | PASS | ពិនិត្យតែការគណនាលើឧទាហរណ៍សិប្បនិម្មិត; **មិនមែន** ពិន្ទុ accuracy របស់ផលិតផល។ |

## 6. តេស្តមិនទាន់បានដំណើរការ

មិនបានរត់ HTTP/database integration tests សម្រាប់ non-admin, duplicate approval, migration RLS, Stripe webhook, LiveKit quota exhaustion, microphone denial/mute, network disconnect, browser refresh, long recording, responsive UI ឬ real Khmer transcription។ មិនមាន sandbox credentials, LiveKit integration environment ឬ consented/reference audio dataset សម្រាប់វាស់ accuracy។ វិធីវាស់ CER/WER និង factual precision/recall មាននៅ [meeting-quality-evaluation.md](meeting-quality-evaluation.md)។

## 7. Release blockers និងជំហានបន្ទាប់

1. សាកល្បង migrations ទាំងពីរលើ sandbox database ជាមុន; ពិនិត្យថា anon/authenticated មិនអាចចូលតារាងអតិថិជន និង server Prisma នៅដំណើរការ។ អនុវត្ត audit migration មុន deploy code ដែលសរសេរ audit event។
2. បង្កើត និងសាកល្បង server-side LiveKit metering/disconnect មុនអះអាងថា paid LiveKit quota ជា hard limit។
3. ប្រើ sandbox accounts ដើម្បីសាកល្បង workflow billing និង auth ជាក់ស្តែង; ប្រើតែ synthetic ឬ consented audio និង verified reference សម្រាប់ Khmer accuracy។
4. Integration ទាំងបួននៅ Coming Soon។ Telegram ជាជម្រើសដំបូងក្នុង roadmap ប៉ុន្តែត្រូវការ bot credentials និងការកំណត់ workflow មុនសរសេរមុខងារផ្ញើសារ។
