// Shared by the standalone recorder and the video call, so a Bluetooth
// microphone behaves the same in both places: same detection, same label,
// and the same remembered choice - pick the headset once and it is used
// wherever the app records.

// A Bluetooth headset or speakerphone is just another audio input to the
// browser, so recording from one already works. The only way to recognise it
// is the device label, and labels stay blank until microphone permission has
// been granted at least once.
// Matching on the label is the only option: the Web API never says how an
// audio input is connected. Generic wording covers most of it, but plenty of
// real headsets and speakerphones report only a brand or model name with no
// hint of Bluetooth in it ("WH-1000XM4", "Jabra Speak"), so the common
// families are listed too. This only decides whether the 🎧 marker and the
// quality note appear - every input is selectable either way, so a device
// missing from this list still records perfectly well.
const BLUETOOTH_LABEL_PATTERN =
  /bluetooth|hands[-\s]?free|headset|airpod|earbud|buds|wireless|speakerphone|\bbt\b|jabra|jbl|powerconf|anker|soundcore|\bbose\b|\bwh-?\d|\bwf-?\d|beats|sennheiser|plantronics|\bpoly\b|shokz|aftershokz|\bqcy\b|edifier|xiaomi|redmi|huawei|freebuds|nothing ear|\bpixel buds\b/i;

export function isBluetoothDevice(label: string) {
  return BLUETOOTH_LABEL_PATTERN.test(label);
}

// Wireless lavalier kits (DJI Mic, Rode Wireless, Boya, Hollyland,
// Saramonic...) are what people here usually mean by a "Bluetooth mic", but
// most connect through a USB or 3.5mm receiver and report a name like
// "USB Audio Device" - nothing Bluetooth about the label at all. Marked
// separately so they are easy to spot, never used to decide whether a
// microphone exists.
const EXTERNAL_MIC_LABEL_PATTERN = /\busb\b|wireless|lavalier|\bdji\b|\brode\b|\bboya\b|hollyland|saramonic|comica|synco|maono|fifine|external|receiver/i;

export function isExternalMic(label: string) {
  return EXTERNAL_MIC_LABEL_PATTERN.test(label);
}

// Chrome on Windows lists "Default - X" and "Communications - X" as extra
// entries pointing at a real device that is also listed on its own.
export function isVirtualAliasDevice(device: MediaDeviceInfo) {
  return device.deviceId === "default" || device.deviceId === "communications";
}

// Marks Bluetooth entries so they can be picked out of a list that otherwise
// reads as a wall of hardware names, and falls back to a numbered name while
// labels are still hidden.
export function describeAudioDevice(device: MediaDeviceInfo, index: number) {
  if (!device.label) return `Microphone ${index + 1}`;
  const marker = isBluetoothDevice(device.label) ? "🎧 " : isExternalMic(device.label) ? "🎙️ " : "";
  return `${marker}${device.label}`;
}

// Chrome and Edge (desktop and Android) can show a native "pick a nearby
// Bluetooth device" popup, which is the phone-style one-to-one connect people
// expect. It only opens a data connection, though - it cannot route a
// headset's audio into the page. So the chosen device's name is used to find
// and select that same device in the microphone list, and when the operating
// system has not exposed it as a microphone yet the recorder says so plainly.
type BluetoothChooser = {
  requestDevice(options: { acceptAllDevices: boolean }): Promise<{ name?: string | null }>;
};

function bluetoothApi() {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { bluetooth?: BluetoothChooser }).bluetooth;
}

export function supportsBluetoothChooser() {
  return typeof bluetoothApi()?.requestDevice === "function";
}

export async function chooseNearbyBluetoothDevice() {
  const api = bluetoothApi();
  if (!api) return null;
  const device = await api.requestDevice({ acceptAllDevices: true });
  return device.name?.trim() || null;
}

function normalizeDeviceName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function findInputForBluetoothName(inputs: MediaDeviceInfo[], name: string) {
  const target = normalizeDeviceName(name);
  if (target.length < 3) return null;
  return (
    inputs.find((device) => {
      if (isVirtualAliasDevice(device)) return false;
      const label = normalizeDeviceName(device.label);
      return label.length >= 3 && (label.includes(target) || target.includes(label));
    }) ?? null
  );
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
