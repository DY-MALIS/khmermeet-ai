import { Module } from "@/types/lms";

export const productivityModule2: Module = {
  "id": "m-productivity-2",
  "title": "Module 2",
  "titleKh": "ម៉ូឌុលទី ២",
  "lessons": [
    {
      "id": "l-prod-2-1",
      "title": "Personal Prompt Pack",
      "titleKh": "កញ្ចប់ Prompt ផ្ទាល់ខ្លួន",
      "type": "PDF",
      "content": "/course-pdfs/AI%20Skill%20for%20Productivity/Module%202%20-%20Personal%20Prompt%20Pack.pdf",
      "contentKh": "/course-pdfs/AI%20Skill%20for%20Productivity/%E1%9E%98%E1%9F%89%E1%9E%BC%E1%9E%8C%E1%9E%BB%E1%9E%9B%E1%9E%91%E1%9E%B8_%E1%9F%A2_%E1%9E%80%E1%9E%89%E1%9F%92%E1%9E%85%E1%9E%94%E1%9F%8B_Prompt_%E1%9E%95%E1%9F%92%E1%9E%91%E1%9E%B6%E1%9E%9B%E1%9F%8B%E1%9E%81%E1%9F%92%E1%9E%9B%E1%9E%BD%E1%9E%93.pdf"
    },
    {
      "id": "l-prod-2-3",
      "title": "Quiz",
      "titleKh": "កម្រងសំណួរ",
      "type": "QUIZ",
      "content": "Test your knowledge of prompt packs and RCTTC.",
      "contentKh": "សាកល្បងចំណេះដឹងរបស់អ្នកអំពីកញ្ចប់ prompt និង RCTTC។",
      "quiz": [
        {
          "id": "q-prod-2-1",
          "question": "A prompt pack is mainly used to:",
          "questionKh": "កញ្ចប់ prompt ត្រូវបានប្រើប្រាស់សំខាន់ដើម្បី៖",
          "options": [
            "make AI creative only",
            "get consistent reusable outputs",
            "avoid planning"
          ],
          "optionsKh": [
            "ធ្វើឱ្យ AI មានភាពច្នៃប្រឌិតតែម្យ៉ាង",
            "ទទួលបានលទ្ធផលដែលមានភាពស៊ីសង្វាក់គ្នា និងអាចប្រើឡើងវិញបាន",
            "ជៀសវាងការរៀបចំផែនការ"
          ],
          "correctIndex": 1,
          "explanation": "Prompt packs ensure consistency and reusability.",
          "explanationKh": "កញ្ចប់ prompt ធានានូវភាពស៊ីសង្វាក់គ្នា និងភាពអាចប្រើឡើងវិញបាន។"
        },
        {
          "id": "q-prod-2-2",
          "question": "The “Template” in RCTTC controls:",
          "questionKh": "“Template” នៅក្នុង RCTTC គ្រប់គ្រងលើ៖",
          "options": [
            "the AI’s training",
            "output structure and format",
            "internet access"
          ],
          "optionsKh": [
            "ការបណ្តុះបណ្តាលរបស់ AI",
            "រចនាសម្ព័ន្ធ និងទម្រង់នៃលទ្ធផល",
            "ការចូលប្រើអ៊ីនធឺណិត"
          ],
          "correctIndex": 1,
          "explanation": "The template defines how the output should be structured (e.g., tables, headings).",
          "explanationKh": "Template កំណត់ពីរបៀបដែលលទ្ធផលគួរត្រូវបានរៀបចំរចនាសម្ព័ន្ធ (ឧទាហរណ៍៖ តារាង, ចំណងជើង)។"
        },
        {
          "id": "q-prod-2-3",
          "question": "Best action-tracking format is:",
          "questionKh": "ទម្រង់តាមដានសកម្មភាពដែលល្អបំផុតគឺ៖",
          "options": [
            "long paragraph",
            "Action | Owner | Due date | Status",
            "random bullets"
          ],
          "optionsKh": [
            "កថាខណ្ឌវែង",
            "សកម្មភាព | អ្នកទទួលខុសត្រូវ | កាលបរិច្ឆេទ | ស្ថានភាព",
            "ចំណុចៗចៃដន្យ"
          ],
          "correctIndex": 1,
          "explanation": "A table with clear columns is the most effective way to track actions.",
          "explanationKh": "តារាងដែលមានជួរឈរច្បាស់លាស់ គឺជាមធ្យោបាយដ៏មានប្រសិទ្ធភាពបំផុតក្នុងការតាមដានសកម្មភាព។"
        },
        {
          "id": "q-prod-2-4",
          "question": "Best constraint to reduce hallucination is:",
          "questionKh": "ការកម្រិតដែលល្អបំផុតដើម្បីកាត់បន្ថយការយល់សប្តិ (hallucination) គឺ៖",
          "options": [
            "“Guess if unsure.”",
            "“Be confident.”",
            "“Do not invent facts; label TBD; ask questions.”"
          ],
          "optionsKh": [
            "“ស្មាន ប្រសិនបើមិនច្បាស់។”",
            "“មានទំនុកចិត្ត។”",
            "“កុំបង្កើតការពិត; ដាក់ស្លាក TBD; សួរសំណួរ។”"
          ],
          "correctIndex": 2,
          "explanation": "Explicitly forbidding invention and asking for clarification is the best guardrail.",
          "explanationKh": "ការហាមឃាត់មិនឱ្យបង្កើតការពិត និងការសុំការពន្យល់ឱ្យបានច្បាស់លាស់ គឺជាការពារដ៏ល្អបំផុត។"
        },
        {
          "id": "q-prod-2-5",
          "question": "A good email prompt should specify:",
          "questionKh": "Prompt អ៊ីមែលដ៏ល្អគួរតែបញ្ជាក់ពី៖",
          "options": [
            "nothing, AI will know",
            "word limit + tone + CTA + question",
            "only greeting"
          ],
          "optionsKh": [
            "មិនបាច់បញ្ជាក់អ្វីទាំងអស់, AI នឹងដឹងដោយខ្លួនឯង",
            "កម្រិតពាក្យ + សម្លេង + CTA + សំណួរ",
            "ត្រឹមតែការសួរសុខទុក្ខ"
          ],
          "correctIndex": 1,
          "explanation": "Specific details like word limit, tone, and call-to-action (CTA) improve email quality.",
          "explanationKh": "ព័ត៌មានលម្អិតជាក់លាក់ដូចជា កម្រិតពាក្យ, សម្លេង និងសកម្មភាពដែលចង់ឱ្យធ្វើ (CTA) ជួយកែលម្អគុណភាពអ៊ីមែល។"
        }
      ]
    },
    {
      id: "m-productivity-2-lab",
      title: "Lab",
      titleKh: "មន្ទីរពិសោធន៍",
      type: "LAB",
      content: "You are building a small prompt library for a busy professional. Write three reusable natural-language prompts: one for a polite email, one that converts meeting notes into assigned actions, and one that summarizes weekly progress. Each prompt must include useful placeholders such as [AUDIENCE] and [DEADLINE], describe its exact output layout, and instruct the AI to ask for essential missing inputs or mark them TBD. Keep the three prompts distinct and ready to copy into future work.",
      contentKh: "អ្នកជាអ្នកបង្កើតបណ្ណាល័យ Prompt តូចមួយសម្រាប់អ្នកជំនាញរវល់។ សរសេរ Prompt ភាសាធម្មជាតិដែលអាចប្រើឡើងវិញបី៖ មួយសម្រាប់អ៊ីមែលគួរសម មួយសម្រាប់បម្លែងកំណត់ត្រាប្រជុំទៅជាសកម្មភាពមានអ្នកទទួលខុសត្រូវ និងមួយសម្រាប់សង្ខេបវឌ្ឍនភាពប្រចាំសប្តាហ៍។ Prompt នីមួយៗត្រូវមានកន្លែងបំពេញដូចជា [AUDIENCE] និង [DEADLINE] ពណ៌នាទម្រង់លទ្ធផលច្បាស់ និងណែនាំឱ្យ AI សួរព័ត៌មានចាំបាច់ដែលខ្វះ ឬដាក់ TBD។ រក្សា Prompt ទាំងបីឱ្យខុសគ្នា និងអាចចម្លងទៅប្រើពេលក្រោយបានភ្លាមៗ។",
    }
  ],
  "completionRules": {
    "quizPassPercentage": 70,
    "labPassScore": 7
  }
};
