import assert from "node:assert/strict";
import test from "node:test";
import { createPitchTracker, framePitchHz } from "./voice-pitch";

// A voiced sound with harmonics (like a vowel), at a given pitch.
function voiced(pitchHz: number, seconds: number) {
  return Float32Array.from({ length: Math.round(16000 * seconds) }, (_, i) => {
    const t = i / 16000;
    return 0.3 * Math.sin(2 * Math.PI * pitchHz * t) + 0.25 * Math.sin(2 * Math.PI * 2 * pitchHz * t) + 0.1 * Math.sin(2 * Math.PI * 3 * pitchHz * t);
  });
}

function verdictFor(samples: Float32Array) {
  const tracker = createPitchTracker();
  for (let i = 0; i < samples.length; i += 1600) tracker.push(samples.subarray(i, i + 1600));
  return tracker.verdict();
}

test("reads the fundamental, not a harmonic", () => {
  // A strong second harmonic is what made plain autocorrelation read men at
  // double their pitch; YIN must still find the fundamental.
  for (const hz of [95, 120, 140, 210, 250]) {
    const measured = framePitchHz(voiced(hz, 0.05));
    assert.ok(measured && Math.abs(measured - hz) < hz * 0.03, `${hz} Hz read as ${measured}`);
  }
});

test("decides male, female, or unsure", () => {
  assert.equal(verdictFor(voiced(120, 3)), "male");
  assert.equal(verdictFor(voiced(240, 3)), "female");
  // Between the two bands: do not guess.
  assert.equal(verdictFor(voiced(172, 3)), "unsure");
  // Too little voice to judge, or none at all.
  assert.equal(verdictFor(voiced(120, 0.3)), "unsure");
  assert.equal(verdictFor(new Float32Array(16000 * 3)), "unsure");
});

test("reset starts a new question", () => {
  const tracker = createPitchTracker();
  tracker.push(voiced(120, 3));
  assert.equal(tracker.verdict(), "male");
  tracker.reset();
  tracker.push(voiced(240, 3));
  assert.equal(tracker.verdict(), "female");
});
