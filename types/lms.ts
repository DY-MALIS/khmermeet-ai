export type LessonType = "PDF" | "QUIZ" | "LAB";

export interface QuizQuestion {
  id: string;
  question: string;
  questionKh: string;
  options: string[];
  optionsKh: string[];
  correctIndex: number;
  explanation: string;
  explanationKh: string;
}

export interface Lesson {
  id: string;
  title: string;
  titleKh: string;
  type: LessonType;
  content: string;
  contentKh: string;
  quiz?: QuizQuestion[];
}

export interface Module {
  id: string;
  title: string;
  titleKh: string;
  lessons: Lesson[];
  completionRules: {
    quizPassPercentage: number;
    labPassScore: number;
  };
}
