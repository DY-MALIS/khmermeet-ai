import { readFileSync } from "node:fs";
import { buildLiveSetup, createLiveToken } from "../lib/ai/gemini-live";
import { createLiveActivity } from "../lib/client/live-activity";

// Optional live integration check: pass a raw mono 16 kHz PCM16 recording.
async function main() {
  const pcm = Buffer.concat([readFileSync(process.argv[2]), Buffer.alloc(32000 * 2)]);
  const { token, wsUrl } = await createLiveToken();
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}?access_token=${encodeURIComponent(token)}`);
    let timer: ReturnType<typeof setTimeout>;
    let heard = "", said = "", audioBytes = 0, starts = 0, ends = 0;
    let settled = false, sentAllAudio = false, interrupted = false;
    let completedTurns = 0;
    let endedAt = 0, firstAudioAfterEndMs: number | null = null;
    const timeout = setTimeout(() => finish(new Error(`No complete audio answer within 60 seconds (${starts} starts, ${ends} ends, ${audioBytes} audio bytes)`)), 60000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(timeout);
      ws.close();
      if (error) reject(error); else resolve();
    }
    function checkResult() {
      // A short answer can finish before the trailing test silence is sent.
      // Wait for both input and output so that silence is not a false failure,
      // while still rejecting a response split across multiple input turns.
      if (!sentAllAudio || !completedTurns) return;
      console.log(JSON.stringify({ starts, ends, completedTurns, heard, said, audioBytes, firstAudioAfterEndMs, interrupted }));
      finish(!interrupted && completedTurns === 1 && starts === 1 && ends === 1 && audioBytes > 0 && said.trim() ? undefined : new Error("Incomplete or prematurely split answer"));
    }
    const activity = createLiveActivity((realtimeInput) => {
      if (realtimeInput.activityStart) starts++;
      if (realtimeInput.activityEnd) { ends++; endedAt = Date.now(); }
      ws.send(JSON.stringify({ realtimeInput }));
    });
    ws.onopen = () => {
      console.log("Connected");
      ws.send(JSON.stringify({ setup: buildLiveSetup("The meeting discussed automating accounting reports and assigning next steps.", process.argv[3] === "male" ? "male" : "female") }));
    };
    ws.onclose = (event) => { if (!settled) finish(new Error(`Connection closed before answer (${event.code}): ${event.reason}`)); };
    ws.onerror = () => finish(new Error("WebSocket connection failed"));
    ws.onmessage = async (event) => {
      const m = JSON.parse(typeof event.data === "string" ? event.data : await event.data.text());
      if (m.error) return finish(new Error(JSON.stringify(m.error)));
      if (m.setupComplete !== undefined) {
        console.log("Setup accepted");
        let offset = 0;
        const tick = () => {
          const chunk = pcm.subarray(offset, offset + 3200);
          if (!chunk.length) { sentAllAudio = true; checkResult(); return; }
          let energy = 0;
          for (let i = 0; i + 1 < chunk.length; i += 2) energy += (chunk.readInt16LE(i) / 32768) ** 2;
          activity.push(chunk.toString("base64"), Math.sqrt(energy / (chunk.length / 2)), chunk.length / 32);
          offset += chunk.length;
          timer = setTimeout(tick, 100);
        };
        tick();
      }
      const c = m.serverContent;
      if (!c) return;
      heard += c.inputTranscription?.text ?? "";
      said += c.outputTranscription?.text ?? "";
      interrupted ||= !!c.interrupted;
      for (const part of c.modelTurn?.parts ?? []) audioBytes += part.inlineData?.data?.length ?? 0;
      if (audioBytes && firstAudioAfterEndMs === null) firstAudioAfterEndMs = endedAt ? Date.now() - endedAt : -1;
      if (c.turnComplete) {
        completedTurns++;
        checkResult();
      }
    };
  });
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
