import { Module } from "@/types/lms";

export const productivityModule4: Module = {
  "id": "m-productivity-4",
  "title": "Module 4",
  "titleKh": "ម៉ូឌុលទី ៤",
  "lessons": [
    {
      "id": "l-prod-4-1",
      "title": "Automation Basics & Conclusion",
      "titleKh": "មូលដ្ឋានគ្រឹះស្វ័យប្រវត្តិកម្ម និងសេចក្តីសន្និដ្ឋាន",
      "type": "PDF",
      "content": "/course-pdfs/AI%20Skill%20for%20Productivity/Module%204%20-%20Automation%20Basics%20%26%20Conclusion.pdf",
      "contentKh": "/course-pdfs/AI%20Skill%20for%20Productivity/%E1%9E%98%E1%9F%89%E1%9E%BC%E1%9E%8C%E1%9E%BB%E1%9E%9B%E1%9E%91%E1%9E%B8_%E1%9F%A4_%E1%9E%98%E1%9E%BC%E1%9E%9B%E1%9E%8A%E1%9F%92%E1%9E%8B%E1%9E%B6%E1%9E%93%E1%9E%82%E1%9F%92%E1%9E%9A%E1%9E%B9%E1%9F%87%E1%9E%9F%E1%9F%92%E1%9E%9C%E1%9F%90%E1%9E%99%E1%9E%94%E1%9F%92%E1%9E%9A%E1%9E%9C%E1%9E%8F%E1%9F%92%E1%9E%8F%E1%9E%B7%E1%9E%80%E1%9E%98%E1%9F%92%E1%9E%98_%E1%9E%93%E1%9E%B7%E1%9E%84%E1%9E%9F%E1%9F%81%E1%9E%85%E1%9E%80%E1%9F%92%E1%9E%8F%E1%9E%B8%E1%9E%9F%E1%9E%93%E1%9F%92%E1%9E%93%E1%9E%B7%E1%9E%8A%E1%9F%92%E1%9E%8B%E1%9E%B6%E1%9E%93.pdf"
    },
    {
      "id": "l-prod-4-3",
      "title": "Quiz",
      "titleKh": "កម្រងសំណួរ",
      "type": "QUIZ",
      "content": "Test your knowledge of automation recipes and prompt-agents.",
      "contentKh": "សាកល្បងចំណេះដឹងរបស់អ្នកអំពី \"រូបមន្ត\" ស្វ័យប្រវត្តិកម្ម និងភ្នាក់ងារដែលប្រើ prompt។",
      "quiz": [
        {
          "id": "q-prod-4-1",
          "question": "Automation is best for tasks that are:",
          "questionKh": "ស្វ័យប្រវត្តិកម្មគឺល្អបំផុតសម្រាប់កិច្ចការដែល៖",
          "options": [
            "rare and creative",
            "frequent and repeatable",
            "confidential only"
          ],
          "optionsKh": [
            "កម្រ និងមានភាពច្នៃប្រឌិត",
            "កើតឡើងញឹកញាប់ និងអាចធ្វើដដែលៗបាន",
            "ជាការសម្ងាត់តែប៉ុណ្ណោះ"
          ],
          "correctIndex": 1,
          "explanation": "Frequency and repeatability are the main criteria for automation.",
          "explanationKh": "ភាពញឹកញាប់ និងការធ្វើដដែលៗគឺជាលក្ខណៈវិនិច្ឆ័យចម្បងសម្រាប់ស្វ័យប្រវត្តិកម្ម។"
        },
        {
          "id": "q-prod-4-2",
          "question": "The automation recipe includes:",
          "questionKh": "រូបមន្តស្វ័យប្រវត្តិកម្មរួមមាន៖",
          "options": [
            "only outputs",
            "Trigger, Input, Steps, Output, Storage, Review",
            "vibes"
          ],
          "optionsKh": [
            "មានតែលទ្ធផលចេញ",
            "កេះ (Trigger), បញ្ចូល (Input), ជំហាន (Steps), លទ្ធផល (Output), រក្សាទុក (Storage), ពិនិត្យឡើងវិញ (Review)",
            "អារម្មណ៍ (vibes)"
          ],
          "correctIndex": 1,
          "explanation": "A complete recipe covers the entire process from trigger to review.",
          "explanationKh": "រូបមន្តពេញលេញគ្របដណ្តប់ដំណើរការទាំងមូលតាំងពីការកេះរហូតដល់ការពិនិត្យឡើងវិញ។"
        },
        {
          "id": "q-prod-4-3",
          "question": "A stable prompt-agent must include:",
          "questionKh": "ភ្នាក់ងារ prompt ដែលមានស្ថេរភាពត្រូវតែរួមបញ្ចូល៖",
          "options": [
            "no template",
            "fixed output template + guardrails",
            "jokes"
          ],
          "optionsKh": [
            "គ្មានគំរូ",
            "គំរូលទ្ធផលថេរ + របាំងការពារ (Fixed template + guardrails)",
            "រឿងកំប្លែង"
          ],
          "correctIndex": 1,
          "explanation": "Templates and guardrails ensure the agent performs consistently.",
          "explanationKh": "គំរូ និងរបាំងការពារធានាថាភ្នាក់ងារដំណើរការប្រកបដោយភាពស៊ីសង្វាក់គ្នា។"
        },
        {
          "id": "q-prod-4-4",
          "question": "Best guardrail to avoid hallucination:",
          "questionKh": "របាំងការពារដ៏ល្អបំផុតដើម្បីជៀសវាងការមមៃ (hallucination)៖",
          "options": [
            "“Guess if unsure”",
            "“No invention; mark TBD; ask questions”",
            "“Be confident”"
          ],
          "optionsKh": [
            "“ទាយប្រសិនបើមិនប្រាកដ”",
            "“មិនបង្កើតថ្មី; កត់សម្គាល់ TBD; សួរសំណួរ”",
            "“ឱ្យមានទំនុកចិត្ត”"
          ],
          "correctIndex": 1,
          "explanation": "Explicitly forbidding invention is the most effective guardrail.",
          "explanationKh": "ការហាមឃាត់ការបង្កើតថ្មីដោយច្បាស់លាស់គឺជាករបាំងការពារដែលមានប្រសិទ្ធភាពបំផុត។"
        },
        {
          "id": "q-prod-4-5",
          "question": "Storage naming convention should include:",
          "questionKh": "អនុសញ្ញានៃការដាក់ឈ្មោះសម្រាប់កន្លែងរក្សាទុកគួរតែរួមបញ្ចូល៖",
          "options": [
            "emojis",
            "date + version",
            "nothing"
          ],
          "optionsKh": [
            "រូបសញ្ញាអារម្មណ៍ (Emoji)",
            "កាលបរិច្ឆេទ + កំណែ (date + version)",
            "គ្មានអ្វីសោះ"
          ],
          "correctIndex": 1,
          "explanation": "Date and versioning are essential for tracking and improving systems.",
          "explanationKh": "កាលបរិច្ឆេទ និងកំណែគឺចាំបាច់សម្រាប់ការតាមដាន និងការកែលម្អប្រព័ន្ធ។"
        }
      ]
    }
  ],
  "completionRules": {
    "quizPassPercentage": 70,
    "labPassScore": 7
  }
};
