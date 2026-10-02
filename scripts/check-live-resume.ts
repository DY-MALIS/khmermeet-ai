import { readFileSync } from "node:fs";
import { buildLiveSetup, createLiveToken } from "../lib/ai/gemini-live";
import { createLiveActivity } from "../lib/client/live-activity";

// Optional live integration check for session resumption: asks the first
// recording, reconnects on a new token with the resumption handle, then asks
// the second (a follow-up that needs the first turn). Raw mono 16 kHz PCM16.
type Turn = { heard: string; said: string; handle: string };

function askOnce(pcmPath: string, handle?: string) {
  const pcm = Buffer.concat([readFileSync(pcmPath), Buffer.alloc(32000 * 2)]);
  return createLiveToken().then(({ token, wsUrl }) => new Promise<Turn>((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}?access_token=${encodeURIComponent(token)}`);
    let heard = "", said = "", latest = handle ?? "";
    const timeout = setTimeout(() => { ws.close(); reject(new Error("No answer within 60 seconds")); }, 60000);
    const activity = createLiveActivity((realtimeInput) => ws.send(JSON.stringify({ realtimeInput })));
    ws.onopen = () => ws.send(JSON.stringify({
      setup: buildLiveSetup("The meeting discussed automating accounting reports and assigning next steps.", "female", handle)
    }));
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
    ws.onclose = (event) => reject(new Error(`Closed (${event.code}): ${event.reason}`));
    ws.onmessage = async (event) => {
      const m = JSON.parse(typeof event.data === "string" ? event.data : await event.data.text());
      if (m.error) return reject(new Error(JSON.stringify(m.error)));
      if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) latest = m.sessionResumptionUpdate.newHandle;
      if (m.setupComplete !== undefined) {
        let offset = 0;
        const tick = () => {
          const chunk = pcm.subarray(offset, offset + 3200);
          if (!chunk.length) return;
          let energy = 0;
          for (let i = 0; i + 1 < chunk.length; i += 2) energy += (chunk.readInt16LE(i) / 32768) ** 2;
          activity.push(chunk.toString("base64"), Math.sqrt(energy / (chunk.length / 2)), chunk.length / 32);
          offset += chunk.length;
          setTimeout(tick, 100);
        };
        tick();
        return;
      }
      heard += m.serverContent?.inputTranscription?.text ?? "";
      said += m.serverContent?.outputTranscription?.text ?? "";
      if (m.serverContent?.turnComplete) {
        // The handle for the finished turn can arrive just after turnComplete.
        setTimeout(() => {
          clearTimeout(timeout);
          ws.onclose = null;
          ws.close();
          resolve({ heard, said, handle: latest });
        }, 1500);
      }
    };
  }));
}

async function main() {
  const first = await askOnce(process.argv[2]);
  console.log(JSON.stringify({ turn: 1, heard: first.heard, said: first.said, gotHandle: !!first.handle }));
  if (!first.handle) throw new Error("No resumption handle was sent");
  const second = await askOnce(process.argv[3], first.handle);
  console.log(JSON.stringify({ turn: 2, heard: second.heard, said: second.said }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
