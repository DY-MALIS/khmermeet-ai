import { Module } from "@/types/lms";

export const productivityModule3: Module = {
  "id": "m-productivity-3",
  "title": "Module 3",
  "titleKh": "ម៉ូឌុលទី ៣",
  "lessons": [
    {
      "id": "l-prod-3-1",
      "title": "Planning & Execution Systems",
      "titleKh": "ប្រព័ន្ធរៀបចំផែនការ និងការអនុវត្ត",
      "type": "PDF",
      "content": "/course-pdfs/AI%20Skill%20for%20Productivity/Module%203%20-%20Planning%20%26%20Execution%20Systems.pdf",
      "contentKh": "/course-pdfs/AI%20Skill%20for%20Productivity/%E1%9E%98%E1%9F%89%E1%9E%BC%E1%9E%8C%E1%9E%BB%E1%9E%9B%E1%9E%91%E1%9E%B8_%E1%9F%A3_%E1%9E%94%E1%9F%92%E1%9E%9A%E1%9E%96%E1%9F%90%E1%9E%93%E1%9F%92%E1%9E%92%E1%9E%9A%E1%9F%80%E1%9E%94%E1%9E%85%E1%9F%86%E1%9E%95%E1%9F%82%E1%9E%93%E1%9E%80%E1%9E%B6%E1%9E%9A_%E1%9E%93%E1%9E%B7%E1%9E%84%E1%9E%80%E1%9E%B6%E1%9E%9A%E1%9E%A2%E1%9E%93%E1%9E%BB%E1%9E%9C%E1%9E%8F%E1%9F%92%E1%9E%8F.pdf"
    },
    {
      "id": "l-prod-3-3",
      "title": "Quiz",
      "titleKh": "កម្រងសំណួរ",
      "type": "QUIZ",
      "content": "Test your knowledge of planning systems and time blocking.",
      "contentKh": "សាកល្បងចំណេះដឹងរបស់អ្នកអំពីប្រព័ន្ធរៀបចំផែនការ និងការបែងចែកប្លុកពេលវេលា។",
      "quiz": [
        {
          "id": "q-prod-3-1",
          "question": "A weekly outcome is best described as:",
          "questionKh": "លទ្ធផលប្រចាំសប្តាហ៍ត្រូវបានពិពណ៌នាថាជា៖",
          "options": [
            "a list of tasks",
            "a measurable result with a definition of done",
            "a long meeting"
          ],
          "optionsKh": [
            "បញ្ជីនៃភារកិច្ច",
            "លទ្ធផលដែលអាចវាស់វែងបានជាមួយនិយមន័យនៃភាពជោគជ័យ",
            "ការប្រជុំវែងឆ្ងាយ"
          ],
          "correctIndex": 1,
          "explanation": "Outcomes are measurable results, not just tasks.",
          "explanationKh": "លទ្ធផលគឺជាអ្វីដែលអាចវាស់វែងបាន មិនមែនត្រឹមតែជាភារកិច្ចនោះទេ។"
        },
        {
          "id": "q-prod-3-2",
          "question": "Best daily priority limit is:",
          "questionKh": "ដែនកំណត់អាទិភាពប្រចាំថ្ងៃដែលល្អបំផុតគឺ៖",
          "options": [
            "10",
            "7",
            "3"
          ],
          "optionsKh": [
            "១០",
            "៧",
            "៣"
          ],
          "correctIndex": 2,
          "explanation": "Focusing on 3 top priorities ensures they actually get done.",
          "explanationKh": "ការផ្តោតលើអាទិភាពកំពូលទាំង ៣ ធានាថាពួកវាត្រូវបានបំពេញបានសម្រេចពិតប្រាកដ។"
        },
        {
          "id": "q-prod-3-3",
          "question": "A “next action” should be:",
          "questionKh": "“សកម្មភាពបន្ទាប់” (next action) គួរតែ៖",
          "options": [
            "vague (“work on project”)",
            "specific (verb + object + time)",
            "emotional"
          ],
          "optionsKh": [
            "មិនច្បាស់លាស់ (“ធ្វើការលើគម្រោង”)",
            "ជាក់លាក់ (កិរិយាស័ព្ទ + កម្មបទ + ពេលវេលា)",
            "តាមអារម្មណ៍"
          ],
          "correctIndex": 1,
          "explanation": "Next actions must be concrete and actionable.",
          "explanationKh": "សកម្មភាពបន្ទាប់ត្រូវតែជាក់ស្តែង និងអាចអនុវត្តបាន។"
        },
        {
          "id": "q-prod-3-4",
          "question": "Time blocking helps mainly by:",
          "questionKh": "ការបែងចែកប្លុកពេលវេលាជួយសំខាន់ទៅលើ៖",
          "options": [
            "making plans look pretty",
            "reducing context switching and protecting deep work",
            "increasing meetings"
          ],
          "optionsKh": [
            "ធ្វើឱ្យផែនការមើលទៅស្អាត",
            "កាត់បន្ថយការប្តូរការងារចុះឡើង និងការពារការងារស៊ីជម្រៅ",
            "បង្កើនការប្រជុំ"
          ],
          "correctIndex": 1,
          "explanation": "Time blocking protects your time for focused work.",
          "explanationKh": "ការបែងចែកប្លុកពេលវេលាការពារពេលវេលារបស់អ្នកសម្រាប់ការងារដែលត្រូវផ្ដោតអារម្មណ៍។"
        },
        {
          "id": "q-prod-3-5",
          "question": "The weekly loop is:",
          "questionKh": "លំហូរប្រចាំសប្តាហ៍គឺ៖",
          "options": [
            "Plan → Execute → Review → Improve",
            "Improve → Plan → Forget",
            "Execute only"
          ],
          "optionsKh": [
            "រៀបចំផែនការ → អនុវត្ត → ពិនិត្យឡើងវិញ → កែលម្អ",
            "កែលម្អ → រៀបចំផែនការ → ភ្លេចចោល",
            "អនុវត្តតែម្យ៉ាង"
          ],
          "correctIndex": 0,
          "explanation": "The full loop ensures continuous improvement.",
          "explanationKh": "លំហូរពេញលេញធានានូវការកែលម្អជាបន្តបន្ទាប់។"
        }
      ]
    },
    {
      id: "m-productivity-3-lab",
      title: "Lab",
      titleKh: "មន្ទីរពិសោធន៍",
      type: "LAB",
      content: "You are a planning coach turning five commitments—finish a proposal, prepare Monday's meeting, reply to 12 clients, exercise three times, and study for two hours—into a sustainable weekly plan. Define three measurable weekly outcomes, schedule no more than three priorities per day, convert each commitment into concrete next actions, and place the work into realistic time blocks. Present a Monday-to-Friday plan followed by a Friday review checklist, and clearly flag assumptions about duration or availability.",
      contentKh: "អ្នកជាគ្រូបង្វឹកផែនការ ដែលបម្លែងកាតព្វកិច្ចប្រាំ—បញ្ចប់សំណើ រៀបចំកិច្ចប្រជុំថ្ងៃចន្ទ ឆ្លើយអតិថិជន ១២ នាក់ ហាត់ប្រាណបីដង និងសិក្សាពីរម៉ោង—ទៅជាផែនការប្រចាំសប្តាហ៍ដែលអាចអនុវត្តបាន។ កំណត់លទ្ធផលប្រចាំសប្តាហ៍អាចវាស់វែងបី ដាក់អាទិភាពមិនលើសបីក្នុងមួយថ្ងៃ បម្លែងកាតព្វកិច្ចទៅជាសកម្មភាពបន្ទាប់ជាក់លាក់ និងកំណត់ពេលវេលាសមហេតុផល។ បង្ហាញផែនការពីថ្ងៃចន្ទដល់សុក្រ បន្ទាប់ដោយបញ្ជីពិនិត្យថ្ងៃសុក្រ ហើយសម្គាល់ការសន្មតអំពីរយៈពេលឬពេលទំនេរឱ្យច្បាស់។",
    }
  ],
  "completionRules": {
    "quizPassPercentage": 70,
    "labPassScore": 7
  }
};
