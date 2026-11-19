// FFmpeg's silencedetect reports each quiet interval against the original
// timeline. Short pauses under half a second remain part of spoken time.
export function spokenSecondsFromFfmpegLog(stderr: string, durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Audio duration could not be verified.");
  const events = [...stderr.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)];
  let start: number | null = null;
  let silentSeconds = 0;
  for (const event of events) {
    const time = Math.max(0, Math.min(durationSeconds, Number(event[2])));
    if (event[1] === "start") start = time;
    else if (start !== null) {
      silentSeconds += Math.max(0, time - start);
      start = null;
    }
  }
  if (start !== null) silentSeconds += durationSeconds - start;
  return Math.max(0, Math.ceil(durationSeconds - Math.min(durationSeconds, silentSeconds)));
}
