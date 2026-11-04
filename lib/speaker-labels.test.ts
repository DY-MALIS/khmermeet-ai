import assert from "node:assert/strict";
import test from "node:test";
import { keepTrustedSpeakerLabels } from "./speaker-labels";

test("unverified names become stable generic labels without changing speech", () => {
  const input = "Speaker 1: ចាប់ផ្តើម\nLisa: 23 នាក់មកហើយ\nLisa: ចាស\nឈ្មោះដែលទាយ: បន្ត";
  assert.equal(
    keepTrustedSpeakerLabels(input, []),
    "Speaker 1: ចាប់ផ្តើម\nSpeaker 2: 23 នាក់មកហើយ\nSpeaker 2: ចាស\nSpeaker 3: បន្ត"
  );
});

test("registered participant names stay while other names remain generic", () => {
  assert.equal(
    keepTrustedSpeakerLabels("Malis: សួស្តី\nLisa: hello\nUnknown Speaker: yes", ["Malis"]),
    "Malis: សួស្តី\nSpeaker 1: hello\nUnknown Speaker: yes"
  );
});
