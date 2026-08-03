"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { QuizQuestion } from "@/types/lms";

export function AieurekaQuiz({ questions, passPercentage }: { questions: QuizQuestion[]; passPercentage: number }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = questions.every((question) => answers[question.id] !== undefined);
  const correctCount = questions.filter((question) => answers[question.id] === question.correctIndex).length;
  const scorePercentage = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
  const passed = scorePercentage >= passPercentage;

  function selectAnswer(questionId: string, optionIndex: number) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  function reset() {
    setAnswers({});
    setSubmitted(false);
  }

  return (
    <div className="space-y-4">
      {questions.map((question, index) => {
        const selected = answers[question.id];
        return (
          <div key={question.id} className="rounded-lg border border-slate-100 p-4">
            <p className="font-semibold text-ink">
              {index + 1}. {question.question}
            </p>
            <p className="mt-1 text-sm text-slate-500">{question.questionKh}</p>
            <div className="mt-3 space-y-2">
              {question.options.map((option, optionIndex) => {
                const isSelected = selected === optionIndex;
                const isCorrectOption = optionIndex === question.correctIndex;
                const showResult = submitted;
                const tone = !showResult
                  ? isSelected
                    ? "border-leaf bg-leaf/5"
                    : "border-slate-200 hover:border-leaf/40"
                  : isCorrectOption
                    ? "border-emerald-400 bg-emerald-50"
                    : isSelected
                      ? "border-red-300 bg-red-50"
                      : "border-slate-200";
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    disabled={submitted}
                    onClick={() => selectAnswer(question.id, optionIndex)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${tone}`}
                  >
                    <span>
                      {option}
                      <span className="ml-2 text-xs text-slate-400">{question.optionsKh[optionIndex]}</span>
                    </span>
                    {showResult && isCorrectOption ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                    {showResult && isSelected && !isCorrectOption ? <XCircle className="h-4 w-4 shrink-0 text-red-500" /> : null}
                  </button>
                );
              })}
            </div>
            {submitted ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">
                <p>{question.explanation}</p>
                <p className="mt-1 text-slate-500">{question.explanationKh}</p>
              </div>
            ) : null}
          </div>
        );
      })}

      {submitted ? (
        <div className={`rounded-lg border p-4 ${passed ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
          <p className={`font-bold ${passed ? "text-emerald-700" : "text-red-700"}`}>
            {passed ? "Passed" : "Not passed yet"} - {correctCount}/{questions.length} ({scorePercentage}%, need {passPercentage}%)
          </p>
          <button className="kh-button-secondary mt-3" type="button" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Retry quiz
          </button>
        </div>
      ) : (
        <button className="kh-button-primary" type="button" onClick={() => setSubmitted(true)} disabled={!allAnswered}>
          Submit quiz
        </button>
      )}
    </div>
  );
}
