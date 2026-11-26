import assert from "node:assert/strict";
import test from "node:test";
import { keepItemsWithTranscriptSource, keepNewExtractedTasks } from "./grounded-extraction";

test("only verbatim transcript excerpts support extracted claims", () => {
  const transcript = "Speaker 1: We will send the report on Friday.\nSpeaker 2: ត្រូវពិនិត្យឯកសារ។";
  assert.deepEqual(keepItemsWithTranscriptSource([
    { title: "report", sourceText: "We will send the report on Friday." },
    { title: "Khmer", sourceText: "ត្រូវពិនិត្យឯកសារ។" },
    { title: "invented", sourceText: "We approved the budget." },
    { title: "missing", sourceText: null }
  ], transcript).map((item) => item.title), ["report", "Khmer"]);
});

test("regenerating extraction does not duplicate existing tasks", () => {
  const existing = [{ title: "Send report", sourceText: "We will send the report." }];
  const tasks = [
    { title: "Send report", sourceText: "We will send the report." },
    { title: "Call vendor", sourceText: "Please call the vendor." },
    { title: "Call vendor", sourceText: "Please call the vendor." }
  ];
  assert.deepEqual(keepNewExtractedTasks(tasks, existing).map((task) => task.title), ["Call vendor"]);
});
