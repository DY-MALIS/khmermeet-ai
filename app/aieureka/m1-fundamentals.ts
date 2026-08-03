import { Module } from "@/types/lms";

export const productivityModule1: Module = {
  "id": "m-productivity-1",
  "title": "Module 1",
  "titleKh": "ម៉ូឌុលទី ១",
  "lessons": [
    {
      "id": "l-prod-1-1",
      "title": "Productivity with AI Fundamentals",
      "titleKh": "ផលិតភាពជាមួយនឹងមូលដ្ឋានគ្រឹះ AI",
      "type": "PDF",
      "content": "/course-pdfs/AI%20Skill%20for%20Productivity/Module%201%20-%20Productivity%20with%20AI%20Fundamentals.pdf",
      "contentKh": "/course-pdfs/AI%20Skill%20for%20Productivity/%E1%9E%98%E1%9F%89%E1%9E%BC%E1%9E%8C%E1%9E%BB%E1%9E%9B%E1%9E%91%E1%9E%B8_%E1%9F%A1_%E1%9E%95%E1%9E%9B%E1%9E%B7%E1%9E%8F%E1%9E%97%E1%9E%B6%E1%9E%96%E1%9E%87%E1%9E%B6%E1%9E%98%E1%9E%BD%E1%9E%99%E1%9E%93%E1%9E%B9%E1%9E%84%E1%9E%98%E1%9E%BC%E1%9E%9B%E1%9E%8A%E1%9F%92%E1%9E%8B%E1%9E%B6%E1%9E%93%E1%9E%82%E1%9F%92%E1%9E%9A%E1%9E%B9%E1%9F%87_AI.pdf"
    },
    {
      "id": "l-prod-1-3",
      "title": "Quiz",
      "titleKh": "កម្រងសំណួរ",
      "type": "QUIZ",
      "content": "Test your knowledge of AI productivity fundamentals.",
      "contentKh": "សាកល្បងចំណេះដឹងរបស់អ្នកអំពីមូលដ្ឋានគ្រឹះផលិតភាព AI។",
      "quiz": [
        {
          "id": "q-prod-1-1",
          "question": "AI productivity is mainly about:",
          "questionKh": "ផលិតភាព AI សំខាន់គឺអំពី៖",
          "options": [
            "asking once and accepting output",
            "building repeatable workflows and templates",
            "writing longer prompts always"
          ],
          "optionsKh": [
            "ការសួរតែម្តងហើយទទួលយកលទ្ធផល",
            "ការបង្កើតលំហូរការងារ និងគំរូដែលអាចប្រើឡើងវិញបាន",
            "ការសរសេរ prompt ឱ្យវែងជានិច្ច"
          ],
          "correctIndex": 1,
          "explanation": "Productivity with AI is about systems and repeatable workflows, not just one-off prompts.",
          "explanationKh": "ផលិតភាពជាមួយ AI គឺអំពីប្រព័ន្ធ និងលំហូរការងារដែលអាចធ្វើឡើងវិញបាន មិនមែនត្រឹមតែការសរសេរ prompt ម្តងម្កាលនោះទេ។"
        },
        {
          "id": "q-prod-1-2",
          "question": "The 5-step workflow is:",
          "questionKh": "លំហូរការងារ ៥ ជំហានគឺ៖",
          "options": [
            "Capture → Clarify → Create → Check → Store",
            "Create → Capture → Store → Guess → Publish",
            "Store → Check → Create → Capture → Clarify"
          ],
          "optionsKh": [
            "ចាប់យក → បញ្ជាក់ → បង្កើត → ត្រួតពិនិត្យ → រក្សាទុក",
            "បង្កើត → ចាប់យក → រក្សាទុក → ស្មាន → បោះពុម្ព",
            "រក្សាទុក → ត្រួតពិនិត្យ → បង្កើត → ចាប់យក → បញ្ជាក់"
          ],
          "correctIndex": 0,
          "explanation": "The correct order is Capture, Clarify, Create, Check, and finally Store.",
          "explanationKh": "លំដាប់ដែលត្រឹមត្រូវគឺ ចាប់យក, បញ្ជាក់, បង្កើត, ត្រួតពិនិត្យ និងចុងក្រោយគឺ រក្សាទុក។"
        },
        {
          "id": "q-prod-1-3",
          "question": "A Green task is:",
          "questionKh": "ភារកិច្ចកម្រិតពណ៌បៃតងគឺ៖",
          "options": [
            "legal advice",
            "summarizing your own notes into action items",
            "diagnosing symptoms"
          ],
          "optionsKh": [
            "ដំបូន្មានផ្លូវច្បាប់",
            "ការសង្ខេបកំណត់ចំណាំផ្ទាល់ខ្លួនរបស់អ្នកទៅជាសកម្មភាព",
            "ការវិនិច្ឆ័យរោគសញ្ញា"
          ],
          "correctIndex": 1,
          "explanation": "Summarizing your own notes is a safe, \"Green\" task for AI.",
          "explanationKh": "ការសង្ខេបកំណត់ចំណាំផ្ទាល់ខ្លួនរបស់អ្នក គឺជាការងារដែលមានសុវត្ថិភាព ឬកម្រិត \"ពណ៌បៃតង\" សម្រាប់ AI។"
        },
        {
          "id": "q-prod-1-4",
          "question": "A Yellow task should include:",
          "questionKh": "ភារកិច្ចកម្រិតពណ៌លឿងគួរតែរួមបញ្ចូល៖",
          "options": [
            "no constraints",
            "verification step + assumptions",
            "guessing missing details"
          ],
          "optionsKh": [
            "គ្មានការកម្រិត",
            "ជំហានផ្ទៀងផ្ទាត់ + ការសន្មត",
            "ការស្មានព័ត៌មានលម្អិតដែលបាត់"
          ],
          "correctIndex": 1,
          "explanation": "Yellow tasks require verification and clearly stated assumptions.",
          "explanationKh": "ភារកិច្ចពណ៌លឿងត្រូវការការផ្ទៀងផ្ទាត់ និងការបញ្ជាក់ពីការសន្មតឱ្យបានច្បាស់លាស់។"
        },
        {
          "id": "q-prod-1-5",
          "question": "Best way to keep outputs consistent is:",
          "questionKh": "មធ្យោបាយដ៏ល្អបំផុតដើម្បីរក្សាលទ្ធផលឱ្យមានភាពស៊ីសង្វាក់គ្នាគឺ៖",
          "options": [
            "change format each time",
            "enforce a template and checklist",
            "trust confidence"
          ],
          "optionsKh": [
            "ប្តូរទម្រង់រាល់ពេល",
            "អនុវត្តតាមគំរូ និងបញ្ជីត្រួតពិនិត្យ",
            "ជឿជាក់លើទំនុកចិត្ត"
          ],
          "correctIndex": 1,
          "explanation": "Templates and checklists are key to consistency.",
          "explanationKh": "គំរូ (Templates) និងបញ្ជីត្រួតពិនិត្យ (Checklists) គឺជាគន្លឹះនៃភាពស៊ីសង្វាក់គ្នា។"
        }
      ]
    },
    {
      id: "m-productivity-1-lab",
      title: "Lab",
      titleKh: "មន្ទីរពិសោធន៍",
      type: "LAB",
      content: "You are a productivity coach helping a professional decide where AI belongs in their work. Classify summarizing personal notes, drafting a routine email, deciding employee discipline, analyzing anonymized survey themes, and approving a payment as Green, Yellow, or Red with a brief reason. Choose one Green or Yellow task and demonstrate Capture → Clarify → Create → Check → Store, including the reusable output template, assumptions and verification for Yellow work, the human review point, and the prompt plus example worth saving.",
      contentKh: "អ្នកជាគ្រូបង្វឹកផលិតភាព ដែលជួយអ្នកជំនាញសម្រេចថាតើគួរប្រើ AI នៅកន្លែងណា។ ចាត់ថ្នាក់ការសង្ខេបកំណត់ត្រាផ្ទាល់ខ្លួន ព្រាងអ៊ីមែលធម្មតា សម្រេចវិន័យបុគ្គលិក វិភាគប្រធានបទស្ទង់មតិអនាមិក និងអនុម័តការទូទាត់ជា បៃតង លឿង ឬក្រហម ជាមួយហេតុផលខ្លី។ ជ្រើសកិច្ចការបៃតងឬលឿងមួយ ហើយបង្ហាញ Capture → Clarify → Create → Check → Store រួមមានគំរូលទ្ធផលដែលអាចប្រើឡើងវិញ ការសន្មតនិងការផ្ទៀងផ្ទាត់សម្រាប់ការងារលឿង ចំណុចត្រួតពិនិត្យដោយមនុស្ស និង Prompt ព្រមទាំងលទ្ធផលគំរូដែលគួររក្សាទុក។",
    }
  ],
  "completionRules": {
    "quizPassPercentage": 70,
    "labPassScore": 7
  }
};
