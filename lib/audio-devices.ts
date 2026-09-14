// Shared by the standalone recorder and the video call, so a Bluetooth
// microphone behaves the same in both places: same detection, same label,
// and the same remembered choice - pick the headset once and it is used
// wherever the app records.

// A Bluetooth headset or speakerphone is just another audio input to the
// browser, so recording from one already works. The only way to recognise it
// is the device label, and labels stay blank until microphone permission has
// been granted at least once.
const BLUETOOTH_LABEL_PATTERN = /bluetooth|hands[-\s]?free|headset|airpod|earbud|\bbt\b/i;

export function isBluetoothDevice(label: string) {
  return BLUETOOTH_LABEL_PATTERN.test(label);
}

// Marks Bluetooth entries so they can be picked out of a list that otherwise
// reads as a wall of hardware names, and falls back to a numbered name while
// labels are still hidden.
export function describeAudioDevice(device: MediaDeviceInfo, index: number) {
  if (!device.label) return `Microphone ${index + 1}`;
  return `${isBluetoothDevice(device.label) ? "🎧 " : ""}${device.label}`;
}

const SAVED_MICROPHONE_KEY = "khmermeet-microphone-id";

export function readSavedMicrophoneId() {
  try {
    return window.localStorage.getItem(SAVED_MICROPHONE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveMicrophoneId(deviceId: string) {
  try {
    if (deviceId) window.localStorage.setItem(SAVED_MICROPHONE_KEY, deviceId);
    else window.localStorage.removeItem(SAVED_MICROPHONE_KEY);
  } catch {
    // Storage blocked - the choice just will not survive a reload.
  }
}

// Device labels are hidden until microphone permission has been granted once,
// which is what leaves a Bluetooth headset showing as an unhelpful
// "Microphone 2". Asking for the microphone and releasing it immediately
// unlocks the real names without starting anything.
export async function unlockDeviceLabels() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export async function listAudioInputs() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return devices.filter((device) => device.kind === "audioinput");
}
