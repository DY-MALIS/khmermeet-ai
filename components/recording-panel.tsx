"use client";

import { CheckCircle2, Mic, Moon, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadRecordingDirect } from "@/lib/client/direct-upload";
import { describeMicError } from "@/lib/mic-permission-error";
import { clampMeetingDurationSeconds, MAX_MEETING_DURATION_MS } from "@/lib/meeting-duration";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  describeAudioDevice,
  chooseNearbyBluetoothDevice,
  findInputForBluetoothName,
  isBluetoothDevice,
  isVirtualAliasDevice,
  listAudioInputs,
  supportsBluetoothChooser,
  readSavedMicrophoneId,
  saveMicrophoneId,
  unlockDeviceLabels
} from "@/lib/audio-devices";

// Standalone room recording should capture the room as faithfully as possible.
// Browser noise suppression is tuned for close-talk calls and can erase quiet
// far-field speakers as "background"; the server-side ffmpeg pass handles
// denoise/leveling before transcription, where it can be retried safely.
// Two recording modes, because a phone and a computer need opposite things
// and a single setting for both has now failed twice in the owner's hands.
//
// A laptop recording a meeting room is a far-field problem: the browser's own
// noise suppression is tuned for someone talking into a headset and erases the
// quiet person at the other end of the table as "background", so it is turned
// off and the leveling is done afterwards.
//
// A phone is the opposite. Its voice processing is the whole reason an iPhone
// sounds good, and it is one unit: asking for echoCancellation:false switches
// the unit off and takes automatic gain with it, leaving the raw capsule,
// which is much quieter. On a phone the device is left to do its job and the
// browser adds nothing on top.
const clearVoiceAudioConstraints: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 }
};

// How loud the microphone signal should be before it reaches the compressor.
// About -20 dBFS during speech, which is a normal recording level and leaves
// plenty of headroom.
const TARGET_INPUT_RMS = 0.1;
// Below this there is nothing to measure - an empty room, not a weak
// microphone - so the gain is left where it is rather than wound up into the
// noise floor.
const SPEECH_FLOOR_RMS = 0.002;
const MIN_INPUT_GAIN = 1;
const MAX_INPUT_GAIN = 16;

// iOS ties automatic gain control to the same voice-processing audio unit as
// echo cancellation. Asking for echoCancellation:false - which the room
// constraints above deliberately do, so far-field speech is not erased as
// background noise - switches that whole unit off, and the autoGainControl:true
// sitting next to it is then quietly ignored. What is left is the raw iPhone
// microphone, which is far quieter than the processed one: confirmed by the
// owner on an iPhone, where the input meter stayed in the low band however
// loudly the room spoke, while the same page on a computer reached a normal
// level - and phone recordings transcribed noticeably worse than computer ones.
const voiceProcessingAudioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 }
};

// Recordings pick up speakers away from the device (an ambient room mic,
// not someone talking directly into it), so quiet voices sit closer to the
// noise floor than a close-talk mic would - keep this low to avoid flagging
// legitimate far-field audio as silent.
const silentInputThreshold = 0.0012;

// Upper bound on how many times the browser will ask the server to continue a
// long recording. Twenty fifteen-minute windows is a five-hour meeting, and a
// pass gets through several of them, so this is generous - it exists to stop
// a stuck recording looping forever, not to cut a real one short.
const MAX_TRANSCRIPTION_PASSES = 12;

function formatTime(seconds: number) {
  const safeSeconds = clampMeetingDurationSeconds(seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function defaultMeetingTitle() {
  return `ការថតសំឡេង ${new Date().toLocaleString()}`;
}

export function RecordingPanel() {
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const micMonitorFrameRef = useRef<number | null>(null);
  const maxMicLevelRef = useRef(0);
  const maxRawMicLevelRef = useRef(0);
  const inputGainRef = useRef<GainNode | null>(null);
  const appliedGainRef = useRef(1);
  const recentRawPeakRef = useRef(0);
  const lastGainAdjustRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [findingDevices, setFindingDevices] = useState(false);
  // null until "show connected" has been pressed; then the real microphones
  // found, so people can see their device listed instead of a guess.
  const [detectedMics, setDetectedMics] = useState<string[] | null>(null);
  const [bluetoothNotice, setBluetoothNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [activeMicLabel, setActiveMicLabel] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [rawMicLevel, setRawMicLevel] = useState(0);
  const [micDiagnostics, setMicDiagnostics] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [savedMeetingId, setSavedMeetingId] = useState("");
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [quietWarning, setQuietWarning] = useState("");
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [voiceProcessingActive, setVoiceProcessingActive] = useState(false);
  const [quietScreenActive, setQuietScreenActive] = useState(false);
  // Default to km-en so mixed Khmer/English meetings are captured as spoken
  // instead of English getting silently translated into Khmer under "km" mode.
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<"km" | "en" | "km-en">("km-en");

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
    fetch("/api/health", { cache: "no-store" })
      .then((response) => setDbUnavailable(!response.ok))
      .catch(() => setDbUnavailable(true));
    const saved = readSavedMicrophoneId();
    if (saved) setSelectedDeviceId(saved);
    void loadAudioDevices();

    return () => cleanupRecording();
    // cleanupRecording only touches refs and should run once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pairing a Bluetooth microphone (or switching it off) while this page is
  // open should update the list straight away, instead of only on reload or
  // when a recording starts.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const onDeviceChange = () =>
      void loadAudioDevices().then((inputs) => {
        // Keep the "found microphones" list current as devices are plugged in,
        // paired, or switched off, once it is on screen.
        setDetectedMics((previous) =>
          previous === null
            ? null
            : inputs.filter((device) => !isVirtualAliasDevice(device)).map((device, index) => describeAudioDevice(device, index))
        );
      });
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const updateElapsed = () => {
      const elapsedMs = accumulatedMsRef.current + (startedAtRef.current ? Date.now() - startedAtRef.current : 0);
      setSeconds(clampMeetingDurationSeconds(Math.floor(elapsedMs / 1000)));
      if (elapsedMs >= MAX_MEETING_DURATION_MS) stop();
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 250);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    const restoreWakeLock = () => {
      if (document.visibilityState === "visible" && state === "recording") void requestRecordingWakeLock();
    };
    document.addEventListener("visibilitychange", restoreWakeLock);
    return () => document.removeEventListener("visibilitychange", restoreWakeLock);
  }, [state]);

  // MediaRecorder now reads from the Web Audio graph instead of the raw
  // device track, and a suspended AudioContext feeds it digital silence
  // rather than simply stopping - so the file keeps growing and the timer
  // keeps counting while nothing is actually being captured. Browsers
  // suspend the context when the tab is backgrounded or the phone screen
  // goes off, which is exactly what happens during a long meeting. Wake it
  // back up whenever the page returns, and on a short timer as a safety net
  // for the devices that suspend it without any visibility change.
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    const resumeAudioGraph = () => {
      const audioContext = recordingAudioContextRef.current;
      if (audioContext && audioContext.state === "suspended") {
        void audioContext.resume().catch(() => undefined);
      }
    };
    resumeAudioGraph();
    document.addEventListener("visibilitychange", resumeAudioGraph);
    const timer = setInterval(resumeAudioGraph, 4000);
    return () => {
      document.removeEventListener("visibilitychange", resumeAudioGraph);
      clearInterval(timer);
    };
  }, [state]);

  useEffect(() => {
    if (state === "recording") return;
    setQuietScreenActive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [state]);

  useEffect(() => {
    const syncQuietScreen = () => {
      if (!document.fullscreenElement) setQuietScreenActive(false);
    };
    document.addEventListener("fullscreenchange", syncQuietScreen);
    return () => document.removeEventListener("fullscreenchange", syncQuietScreen);
  }, []);

  function getMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  function getRecorderOptions(mimeType: string) {
    // Keep enough Opus/AAC detail for distant room voices. 32 kbps made
    // quiet syllables easier for the transcription model to miss or replace.
    return mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
  }

  async function loadAudioDevices() {
    const inputs = await listAudioInputs();
    setAudioDevices(inputs);
    // A remembered microphone that is no longer connected (the Bluetooth
    // headset is off, say) must fall back to the default rather than making
    // start() fail on an exact deviceId that cannot be satisfied.
    setSelectedDeviceId((current) =>
      current && !inputs.some((device) => device.deviceId === current) ? "" : current
    );
    return inputs;
  }

  // Device labels are hidden until microphone permission has been granted
  // once, which is why a Bluetooth headset shows up as an unhelpful
  // "Microphone 2". Asking for the microphone and releasing it immediately
  // unlocks the real names without starting a recording.
  // Phone-style one-to-one connect: Chrome's nearby-device popup, then the
  // chosen device is looked up and selected in the microphone list. The popup
  // itself cannot carry audio, so when the device is not a microphone yet the
  // notice says what still has to happen instead of pretending it worked.
  async function connectBluetoothDevice() {
    setError("");
    setBluetoothNotice(null);
    if (!supportsBluetoothChooser()) {
      await findMicrophones();
      setBluetoothNotice({
        tone: "warn",
        text: "Browser នេះមិនអាចបើកផ្ទាំង Bluetooth បានទេ។ សូមភ្ជាប់ឧបករណ៍ក្នុង Settings រួចចុច \"រកមីក្រូហ្វូន\"។"
      });
      return;
    }
    let name: string | null;
    try {
      name = await chooseNearbyBluetoothDevice();
    } catch (chooserError) {
      // Closing the popup without picking anything is not an error.
      if (chooserError instanceof DOMException && chooserError.name === "NotFoundError") return;
      setBluetoothNotice({
        tone: "warn",
        text: `មិនអាចបើកផ្ទាំង Bluetooth បានទេ៖ ${chooserError instanceof Error ? chooserError.message : String(chooserError)}`
      });
      return;
    }
    await findMicrophones();
    const match = name ? findInputForBluetoothName(await listAudioInputs(), name) : null;
    if (match) {
      rememberMicrophone(match.deviceId);
      setBluetoothNotice({ tone: "ok", text: `បានជ្រើស ${name} ជាមីក្រូហ្វូនសម្រាប់ថតរួច។` });
      return;
    }
    setBluetoothNotice({
      tone: "warn",
      text: `${name ?? "ឧបករណ៍នេះ"} មិនទាន់លេចជា microphone ទេ។ សូមភ្ជាប់វាក្នុង Settings → Bluetooth & devices រួចចុច \"រកមីក្រូហ្វូន\"។`
    });
  }

  async function findMicrophones() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    setFindingDevices(true);
    setError("");
    try {
      await unlockDeviceLabels();
      const inputs = await loadAudioDevices();
      // Show exactly what was found. This used to decide "no Bluetooth
      // connected" from device names alone, which told people with a working
      // wireless mic (typically a USB receiver named "USB Audio Device")
      // that nothing was there. The pairing guide now only appears when no
      // microphone exists at all.
      setDetectedMics(
        inputs.filter((device) => !isVirtualAliasDevice(device)).map((device, index) => describeAudioDevice(device, index))
      );
    } catch (deviceError) {
      setError(describeMicError(deviceError));
    } finally {
      setFindingDevices(false);
    }
  }

  // Only set when the chosen device is recognisably a Bluetooth one, so the
  // quality note below appears for exactly the people it applies to.
  const selectedDevice = audioDevices.find((device) => device.deviceId === selectedDeviceId);
  const selectedBluetoothLabel =
    selectedDevice?.label && isBluetoothDevice(selectedDevice.label) ? selectedDevice.label : "";

  function rememberMicrophone(deviceId: string) {
    setSelectedDeviceId(deviceId);
    saveMicrophoneId(deviceId);
  }

  // Some microphones refuse the tuned constraints outright - a Bluetooth
  // headset on the hands-free profile often cannot offer 48 kHz, and some
  // drivers reject having the browser's own processing switched off. Without
  // a fallback the whole recording fails on those devices, which is why
  // "it works with my Bluetooth" was not true for every headset. Try the
  // tuned settings first, then progressively plainer ones, keeping the chosen
  // device for as long as possible. The "Using:" line shows which microphone
  // actually opened, so a substitution is visible rather than silent.
  async function openMicrophoneStream() {
    const attempts: MediaTrackConstraints[] = [buildAudioConstraints()];
    if (selectedDeviceId) {
      attempts.push({ deviceId: { exact: selectedDeviceId } });
      attempts.push({ deviceId: selectedDeviceId });
    }
    attempts.push({});

    let lastError: unknown;
    for (const audio of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio });
      } catch (streamError) {
        lastError = streamError;
        // Relaxing constraints cannot turn a refused permission into a
        // granted one, so stop rather than prompting repeatedly.
        if (
          streamError instanceof DOMException &&
          (streamError.name === "NotAllowedError" || streamError.name === "SecurityError")
        ) {
          throw streamError;
        }
      }
    }
    throw lastError;
  }

  // Read back what the track actually granted rather than guessing from the
  // user agent. A browser that honoured the tuned far-field request keeps it; a
  // browser that silently dropped the gain control gets reopened with its own
  // voice processing, which is much louder and is the only thing a phone in
  // that state can usefully record. A browser that reports no settings at all
  // is left alone - there is nothing to act on.
  // A phone cannot be inspected from here, so it has to be able to say what it
  // is doing. Everything below comes from the track the device actually
  // handed over, not from what was asked for.
  function describeMicTrack(track: MediaStreamTrack | undefined, processed: boolean, voiceProcessing: boolean) {
    const lines: string[] = [];
    lines.push(`ឧបករណ៍៖ ${track?.label || "(គ្មានឈ្មោះ)"}`);
    const settings = (track?.getSettings?.() ?? {}) as MediaTrackSettings & {
      autoGainControl?: boolean;
      noiseSuppression?: boolean;
      echoCancellation?: boolean;
    };
    const yesNo = (value: boolean | undefined) => (value === undefined ? "មិនបានប្រាប់" : value ? "បើក" : "បិទ");
    lines.push(`បង្កើនសំឡេងស្វ័យប្រវត្តិ៖ ${yesNo(settings.autoGainControl)}`);
    lines.push(`កាត់សំឡេងរំខាន៖ ${yesNo(settings.noiseSuppression)}`);
    lines.push(`កាត់អេកូ៖ ${yesNo(settings.echoCancellation)}`);
    lines.push(`អត្រាគំរូ៖ ${settings.sampleRate ?? "មិនបានប្រាប់"} Hz, ឆានែល ${settings.channelCount ?? "?"}`);
    lines.push(`ប្រើប្រព័ន្ធសំឡេងឧបករណ៍៖ ${voiceProcessing ? "បាទ" : "ទេ"}`);
    lines.push(`ការកែសំឡេងក្នុង browser៖ ${processed ? "ដំណើរការ" : "មិនដំណើរការ (ប្រើសំឡេងឆៅ)"}`);
    lines.push(`ការបង្កើនសំឡេងស្វ័យប្រវត្តិរបស់ app៖ x${appliedGainRef.current.toFixed(1)}`);
    return lines;
  }

  function automaticGainWasGranted(track: MediaStreamTrack | undefined) {
    if (!track || typeof track.getSettings !== "function") return true;
    const settings = track.getSettings() as MediaTrackSettings & { autoGainControl?: boolean };
    if (!settings || Object.keys(settings).length === 0) return true;
    return settings.autoGainControl === true;
  }

  function buildAudioConstraints(): MediaTrackConstraints {
    return selectedDeviceId
      ? { ...clearVoiceAudioConstraints, deviceId: { exact: selectedDeviceId } }
      : clearVoiceAudioConstraints;
  }

  function cleanupRecording() {
    void releaseRecordingWakeLock();
    stopMicMonitor();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    processedStreamRef.current?.getTracks().forEach((track) => track.stop());
    processedStreamRef.current = null;
    displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayStreamRef.current = null;
    void recordingAudioContextRef.current?.close().catch(() => undefined);
    recordingAudioContextRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  async function requestRecordingWakeLock() {
    if (!("wakeLock" in navigator) || wakeLockRef.current || document.visibilityState !== "visible") return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        }
      });
    } catch {
      // Recording still works on browsers or devices that deny Wake Lock.
      setWakeLockActive(false);
    }
  }

  async function releaseRecordingWakeLock() {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    setWakeLockActive(false);
    await sentinel?.release().catch(() => undefined);
  }

  // Walks the input gain towards whatever this microphone actually needs.
  // Driven by the loudest moment in the last stretch rather than the current
  // instant, so it settles on the level of someone speaking instead of
  // pumping between words, and it moves slowly enough not to be audible.
  function adjustInputGain(rawRms: number) {
    const gainNode = inputGainRef.current;
    if (!gainNode) return;
    recentRawPeakRef.current = Math.max(recentRawPeakRef.current, rawRms);

    const now = Date.now();
    if (now - lastGainAdjustRef.current < 700) return;
    lastGainAdjustRef.current = now;

    const peak = recentRawPeakRef.current;
    // Decay rather than reset, so one loud moment does not hold the gain down
    // for the rest of the meeting and a quiet stretch does not wind it up.
    recentRawPeakRef.current = peak * 0.6;
    if (peak < SPEECH_FLOOR_RMS) return;

    const wanted = Math.min(MAX_INPUT_GAIN, Math.max(MIN_INPUT_GAIN, TARGET_INPUT_RMS / peak));
    appliedGainRef.current = wanted;
    try {
      gainNode.gain.setTargetAtTime(wanted, gainNode.context.currentTime, 1.5);
    } catch {
      gainNode.gain.value = wanted;
    }
  }

  function stopMicMonitor() {
    if (micMonitorFrameRef.current !== null) {
      cancelAnimationFrame(micMonitorFrameRef.current);
      micMonitorFrameRef.current = null;
    }
    setMicLevel(0);
    setRawMicLevel(0);
    inputGainRef.current = null;
    appliedGainRef.current = 1;
    recentRawPeakRef.current = 0;
    lastGainAdjustRef.current = 0;
  }

  async function analyzeRecordedAudio(blob: Blob) {
    try {
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
      let peak = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
        const samples = audioBuffer.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) {
          peak = Math.max(peak, Math.abs(samples[index]));
        }
      }
      await audioContext.close().catch(() => undefined);
      return { peak };
    } catch (error) {
      return { decodeError: error instanceof Error ? error.message : String(error) };
    }
  }

  function startMicMonitor(analyser: AnalyserNode, rawAnalyser?: AnalyserNode) {
    stopMicMonitor();
    maxMicLevelRef.current = 0;

    const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    const rawData = rawAnalyser ? new Uint8Array(new ArrayBuffer(rawAnalyser.fftSize)) : null;
    const rmsOf = (node: AnalyserNode, into: Uint8Array<ArrayBuffer>) => {
      node.getByteTimeDomainData(into);
      let sum = 0;
      for (const value of into) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      return Math.sqrt(sum / into.length);
    };
    const updateLevel = () => {
      const rms = rmsOf(analyser, data);
      maxMicLevelRef.current = Math.max(maxMicLevelRef.current, rms);
      setMicLevel(Math.min(1, rms * 12));
      if (rawAnalyser && rawData) {
        const rawRms = rmsOf(rawAnalyser, rawData);
        maxRawMicLevelRef.current = Math.max(maxRawMicLevelRef.current, rawRms);
        setRawMicLevel(Math.min(1, rawRms * 12));
        adjustInputGain(rawRms);
      }
      micMonitorFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  }

  // Apply moderate room-voice leveling before MediaRecorder so a distant
  // speaker is not dwarfed by the nearest person. The compressor prevents
  // close voices from clipping while the make-up gain lifts quieter speech.
  // If Web Audio cannot create an output stream on a device, start() falls
  // back to the untouched microphone stream below.
  async function buildRecordingAudioGraph(microphoneStream: MediaStream) {
    void recordingAudioContextRef.current?.close().catch(() => undefined);
    const audioContext = new AudioContext();
    recordingAudioContextRef.current = audioContext;
    await audioContext.resume().catch(() => undefined);
    const source = audioContext.createMediaStreamSource(microphoneStream);
    // Stands in for the automatic gain control the device may not be giving
    // us. A laptop usually grants it and arrives at a healthy level, so this
    // sits near 1x and does nothing. A phone asked to leave its voice
    // processing off - which is what keeps the person at the far end of the
    // table from being erased as background noise - hands back the raw
    // capsule instead, which is far quieter; here that is measured and made
    // up for. Nobody has to know which device they are on.
    const inputGain = audioContext.createGain();
    inputGain.gain.value = 1;
    const highpass = audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 70;
    highpass.Q.value = 0.7;
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -45;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;
    const makeupGain = audioContext.createGain();
    // The compressor above squashes hard: output above its -45 dB threshold is
    // threshold + (input - threshold) / 4, so even a full-scale input leaves at
    // about -33.75 dBFS. With the 1.6x (+4 dB) this started at, the loudest
    // possible sample reached only -29.7 dBFS - every recording came out very
    // quiet, and speech near the noise floor was lifted by almost nothing,
    // which is the opposite of what the compressor is here for. 5x is +14 dB,
    // putting the ceiling at about -19.8 dBFS: still impossible to clip, while
    // a quiet far-field voice finally rises well clear of the floor.
    // Modest and fixed now that the input side is levelled: the compressor
    // above holds the peaks down, and inputGain has already brought quiet
    // speech up to a normal level, so this only restores what the compression
    // took off rather than trying to rescue the whole signal on its own.
    makeupGain.gain.value = 2.5;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    // A second tap on the microphone before any processing. The on-screen
    // meter reads the processed signal, so if this graph ever weakens or
    // silences the audio on a device, the meter would look healthy while the
    // recording was not - the failure would be invisible. Comparing the two
    // is what makes that visible.
    const rawAnalyser = audioContext.createAnalyser();
    rawAnalyser.fftSize = 1024;
    const destination = audioContext.createMediaStreamDestination();
    source.connect(rawAnalyser);
    source.connect(inputGain);
    inputGain.connect(highpass);
    highpass.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(analyser);
    makeupGain.connect(destination);
    return { analyser, rawAnalyser, inputGain, recordingStream: destination.stream };
  }

  async function buildLevelAnalyserFallback(microphoneStream: MediaStream) {
    void recordingAudioContextRef.current?.close().catch(() => undefined);
    const audioContext = new AudioContext();
    recordingAudioContextRef.current = audioContext;
    await audioContext.resume().catch(() => undefined);
    const source = audioContext.createMediaStreamSource(microphoneStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    return analyser;
  }

  async function start() {
    setError("");
    setQuietWarning("");
    setAudioUrl("");
    setPreviewUrl("");
    setSavedMeetingId("");
    setTranscriptionProgress("");
    cleanupRecording();
    if (!supported) {
      setError("Browser នេះមិនគាំទ្រ audio recording ទេ។ សូមប្រើ Chrome, Edge, ឬ Firefox ថ្មីៗ។");
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setError("Camera/Microphone មិនដំណើរការលើ HTTP LAN link ទេ។ សូមបើកតាម domain HTTPS របស់ app។");
      return;
    }
    try {
      let rawStream = await openMicrophoneStream();
      let [track] = rawStream.getAudioTracks();
      let usedVoiceProcessing = false;
      if (!automaticGainWasGranted(track)) {
        const processedStream = await navigator.mediaDevices
          .getUserMedia({
            audio: selectedDeviceId
              ? { ...voiceProcessingAudioConstraints, deviceId: { exact: selectedDeviceId } }
              : voiceProcessingAudioConstraints
          })
          .catch(() => null);
        if (processedStream) {
          rawStream.getTracks().forEach((existing) => existing.stop());
          rawStream = processedStream;
          [track] = rawStream.getAudioTracks();
          usedVoiceProcessing = true;
        }
      }
      setVoiceProcessingActive(usedVoiceProcessing);
      streamRef.current = rawStream;
      setActiveMicLabel(track?.label || "Default microphone");
      await loadAudioDevices();
      let recordingStream = rawStream;
      let analyser: AnalyserNode;
      let rawAnalyser: AnalyserNode | undefined;
      try {
        const audioGraph = await buildRecordingAudioGraph(rawStream);
        recordingStream = audioGraph.recordingStream;
        processedStreamRef.current = recordingStream;
        analyser = audioGraph.analyser;
        rawAnalyser = audioGraph.rawAnalyser;
        inputGainRef.current = audioGraph.inputGain;
      } catch {
        analyser = await buildLevelAnalyserFallback(rawStream);
      }
      setMicDiagnostics(describeMicTrack(track, Boolean(rawAnalyser), usedVoiceProcessing));
      startMicMonitor(analyser, rawAnalyser);
      const mimeType = getMimeType();
      const media = new MediaRecorder(recordingStream, getRecorderOptions(mimeType));
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      media.onstop = async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        const blobType = media.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type: blobType });
        const localPreview = URL.createObjectURL(blob);
        previewUrlRef.current = localPreview;
        setPreviewUrl(localPreview);
        setQuietWarning("");
        // This check has been wrong before (flagged real, audible recordings
        // as silent) and there is no way to verify audio DSP tuning without
        // actually hearing it. So it must never be the only thing standing
        // between the user and their recording: warn, but always still save
        // it - the preview player above lets them judge for themselves, and
        // a save that turns out fine beats a block that turns out wrong.
        const analysis = await analyzeRecordedAudio(blob);
        if (maxMicLevelRef.current < silentInputThreshold) {
          setQuietWarning(
            "សំឡេងហាក់ស្ងាត់ខ្លាំងកំឡុងពេលថត។ សូមស្តាប់ preview ខាងក្រោមឲ្យប្រាកដ - ការថតនេះនៅតែនឹងត្រូវរក្សាទុកដដែល។"
          );
        } else if (!("decodeError" in analysis) && analysis.peak < silentInputThreshold) {
          setQuietWarning(
            "ឯកសារសំឡេងហាក់ស្ងាត់ខ្លាំង។ សូមស្តាប់ preview ខាងក្រោមឲ្យប្រាកដ - ការថតនេះនៅតែនឹងត្រូវរក្សាទុកដដែល។"
          );
        }
        setUploading(true);
        try {
          let uploadedAudioUrl: string;
          try {
            // Direct-to-Supabase upload bypasses Vercel's hard 4.5MB
            // request-body limit, so long (multi-hour) recordings can
            // still be saved. Falls through to the server-relayed path
            // below when this isn't available (e.g. Supabase Storage not
            // configured) - that path is only reliable for shorter clips.
            uploadedAudioUrl = await uploadRecordingDirect(blob);
          } catch {
            const formData = new FormData();
            formData.append("audio", blob, blobType.includes("mp4") ? "meeting.m4a" : "meeting.webm");
            formData.append("languageMode", transcriptionLanguage);
            formData.append("skipTranscription", "true");
            const response = await fetch("/api/uploads", { method: "POST", body: formData });
            const data = await readJsonResponse<{ audioUrl?: string; error?: string }>(response);
            if (!response.ok || !data.audioUrl) {
              throw new Error(
                data.error ??
                  (response.status === 413
                    ? "សំឡេងធំពេក មិនអាច upload បានទេ។ សូមថតឱ្យខ្លីជាងនេះ។"
                    : "មិនអាចរក្សាទុកសំឡេងបានទេ។")
              );
            }
            uploadedAudioUrl = data.audioUrl;
          }
          setAudioUrl(uploadedAudioUrl);
          setDbUnavailable(false);
          await saveMeetingAuto(uploadedAudioUrl);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "មិនអាច upload សំឡេងបានទេ។ សូមពិនិត្យ server ហើយសាកល្បងម្តងទៀត។"
          );
        } finally {
          setUploading(false);
          rawStream.getTracks().forEach((track) => track.stop());
          processedStreamRef.current?.getTracks().forEach((track) => track.stop());
          processedStreamRef.current = null;
          displayStreamRef.current?.getTracks().forEach((track) => track.stop());
          displayStreamRef.current = null;
          void recordingAudioContextRef.current?.close().catch(() => undefined);
          recordingAudioContextRef.current = null;
          stopMicMonitor();
        }
      };
      recorder.current = media;
      media.start(10000);
      startedAtRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setSeconds(0);
      setState("recording");
      await requestRecordingWakeLock();
    } catch (error) {
      setError(describeMicError(error));
    }
  }

  async function saveMeetingAuto(savedAudioUrl: string) {
    setSavingMeeting(true);
    setError("");
    try {
      // Not the `seconds` state: media.onstop (which calls this) is a closure
      // created back when start() first ran, when `seconds` was just reset to
      // 0 - later setSeconds() calls from stop() don't retroactively update
      // that already-created closure, so it always sent the stale value from
      // recording start (confirmed live: minutes-long recordings saved as
      // "0 seconds"). accumulatedMsRef is a ref, not state, so reading
      // .current here always gets the true final elapsed time regardless of
      // when this closure was created.
      const durationSeconds = clampMeetingDurationSeconds(Math.floor(accumulatedMsRef.current / 1000));
      const response = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || defaultMeetingTitle(),
          audioUrl: savedAudioUrl,
          transcript: "",
          duration: durationSeconds,
          languageMode: transcriptionLanguage
        })
      });
      const data = await readJsonResponse<{ meetingId?: string; error?: string; hint?: string }>(response);
      if (!response.ok || !data.meetingId) throw new Error(data.error ?? data.hint ?? "មិនអាចរក្សាទុកប្រជុំបានទេ។");
      setSavedMeetingId(data.meetingId);
      void transcribeCompleteRecording(data.meetingId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "មិនអាចរក្សាទុកប្រជុំបានទេ។ សូមសាកល្បងម្តងទៀត។");
      // Saving failed before transcription ever started - transcribeCompleteRecording
      // (which normally releases the wake lock once it finishes) never runs.
      void releaseRecordingWakeLock();
    } finally {
      setSavingMeeting(false);
    }
  }

  // A fetch() that dies because the OS suspended the tab (screen locked,
  // app backgrounded) throws a TypeError with a terse, technical message -
  // "Load failed" on mobile Safari, "Failed to fetch" on Chrome - that
  // means nothing to a non-technical user and doesn't explain what to do.
  function isNetworkDropError(error: unknown) {
    if (!(error instanceof TypeError)) return false;
    const message = error.message.toLowerCase();
    return message.includes("load failed") || message.includes("failed to fetch") || message.includes("network");
  }

  async function transcribeCompleteRecording(meetingId: string, isRetry = false) {
    setTranscriptionProgress("កំពុងកែលម្អគុណភាពសំឡេង និងបំលែងឯកសារពេញជាអក្សរ...");
    try {
      // One request can only transcribe as much of a long recording as fits
      // in the server's own time limit, and a 5-hour meeting needs far more
      // than one. The server now keeps every window it finishes, so each
      // further request continues instead of starting over - which is only
      // any use if something actually makes those requests. Keep going here
      // until the meeting is complete, rather than leaving someone to press
      // the button twenty times and hope.
      let pass = 1;
      let previousLength = 0;
      for (;;) {
        const response = await fetch(`/api/meetings/${meetingId}/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ languageMode: transcriptionLanguage })
        });
        const data = await readJsonResponse<{ transcript?: string; error?: string; partial?: boolean }>(response);
        if (!response.ok || !data.transcript?.trim()) {
          throw new Error(data.error ?? "រកមិនឃើញសំឡេងនិយាយច្បាស់លាស់ក្នុងការថតនេះទេ។");
        }
        if (!data.partial) {
          setTranscriptionProgress("បំលែងសំឡេងជាអក្សរ និងសម្អាតអត្ថបទរួចរាល់។ សូមបើកមើលប្រជុំដើម្បីត្រួតពិនិត្យ។");
          break;
        }
        // Stop if a pass adds nothing. Continuing then would just spend the
        // same money again on the same windows for the same result.
        const length = data.transcript.length;
        const madeProgress = length > previousLength;
        previousLength = length;
        if (!madeProgress || pass >= MAX_TRANSCRIPTION_PASSES) {
          setTranscriptionProgress(
            "ការថតនេះវែងណាស់ ហើយនៅមានផ្នែកខ្លះមិនទាន់បំលែងបានទេ។ សំឡេងត្រូវបានរក្សាទុកពេញលេញ។ សូមបើកប្រជុំ រួចចុច \"Re-transcribe audio\" — វានឹងបន្តពីកន្លែងដែលឈប់ មិនចាប់ផ្តើមពីដើមវិញទេ។"
          );
          break;
        }
        pass += 1;
        setTranscriptionProgress(
          `ការថតវែង — កំពុងបន្តផ្នែកទី ${pass}។ អត្ថបទបាន ${length.toLocaleString()} តួរួចហើយ។ សូមទុកទំព័រនេះបើករហូតដល់ចប់។`
        );
      }
      void releaseRecordingWakeLock();
    } catch (error) {
      if (isNetworkDropError(error) && !isRetry) {
        // One automatic retry, keeping the wake lock held rather than
        // releasing and re-requesting it - a brief connection blip
        // recovers on its own; a locked screen won't, but the second
        // attempt still gives the pipeline a chance if the user unlocked
        // in the meantime. Deliberately not awaited here so this call's
        // own stack unwinds immediately - only the retry's outcome should
        // decide when the wake lock is released.
        void transcribeCompleteRecording(meetingId, true);
        return;
      }
      setTranscriptionProgress(
        isNetworkDropError(error)
          ? "បានរក្សាទុកសំឡេងរួច ប៉ុន្តែការតភ្ជាប់ដាច់ ប្រហែលមកពីអេក្រង់ទូរស័ព្ទបានចាក់សោ ឬប្តូរទៅកម្មវិធីផ្សេងពេលកំពុងបំលែង។ សូមទុកអេក្រង់បើក និងស្ថិតនៅលើទំព័រនេះ រួចចុច \"Re-transcribe audio\" ខាងក្រោមដើម្បីសាកម្តងទៀត។"
          : `បានរក្សាទុកសំឡេងរួច ប៉ុន្តែបំលែងជាអក្សរមិនបានទេ៖ ${error instanceof Error ? error.message : "សូមសាកល្បងម្តងទៀត។"}`
      );
      void releaseRecordingWakeLock();
    }
  }

  function pause() {
    void releaseRecordingWakeLock();
    recorder.current?.pause();
    accumulatedMsRef.current += startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    setSeconds(clampMeetingDurationSeconds(Math.floor(accumulatedMsRef.current / 1000)));
    setState("paused");
  }

  function resume() {
    recorder.current?.resume();
    startedAtRef.current = Date.now();
    setState("recording");
    void requestRecordingWakeLock();
  }

  function stop() {
    // Keep the wake lock held (do NOT release it here) - stopping the
    // recording immediately kicks off upload -> save -> transcribe, which
    // can run for minutes. A user is more likely to lock their phone right
    // after pressing stop (they're done watching the timer), and once the
    // screen sleeps, mobile Safari/Chrome suspend the in-flight fetch and
    // the transcription request fails with a generic "Load failed" - not
    // an app bug, but preventable by keeping the screen awake through the
    // whole pipeline. Released once transcribeCompleteRecording finishes
    // (success or failure) or if saving the meeting itself fails first.
    accumulatedMsRef.current += startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    setSeconds(clampMeetingDurationSeconds(Math.floor(accumulatedMsRef.current / 1000)));
    recorder.current?.stop();
    setState("stopped");
  }

  async function enterQuietScreen() {
    setQuietScreenActive(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // The dark overlay still works when a browser denies fullscreen mode.
    }
  }

  async function exitQuietScreen() {
    setQuietScreenActive(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }

  return (
    <div className="kh-card overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-white to-emerald-50/70 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-leaf">Recorder</p>
            <h2 className="text-xl font-bold text-ink">ថតសំឡេងប្រជុំ</h2>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm">
            {state === "recording" ? "កំពុងថត" : state === "paused" ? "បានផ្អាក" : state === "stopped" ? "ថតរួច" : "រួចរាល់"}
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
      <div className="mb-4 rounded-xl border border-saffron/25 bg-saffron/10 p-3 text-sm text-ink">
        សូមប្រាកដថាអ្នកចូលរួមទាំងអស់យល់ព្រម មុននឹងចាប់ផ្តើមថតកិច្ចប្រជុំនេះ។
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
        ពេលកំពុងថត app នឹងព្យាយាមរក្សាអេក្រង់ឱ្យភ្លឺ ដើម្បីកុំឱ្យ browser ផ្អាកមីក្រូហ្វូន។ សូមទុកទំព័រនេះបើករហូតដល់ចុចបញ្ឈប់ ព្រោះការចាក់សោ ឬបិទអេក្រង់អាចធ្វើឱ្យការថតឈប់នៅលើទូរស័ព្ទ/Browser មួយចំនួន។
        {state === "recording" ? (
          <span className={`mt-2 block font-semibold ${wakeLockActive ? "text-leaf" : "text-amber-700"}`}>
            {wakeLockActive ? "រក្សាអេក្រង់ឱ្យភ្លឺ៖ កំពុងដំណើរការ" : "Browser នេះមិនអនុញ្ញាត wake lock ទេ - សូមកុំចាក់សោអេក្រង់។"}
          </span>
        ) : null}
      </div>
      {dbUnavailable ? (
        <div className="mb-4 rounded-xl border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink">
          មិនអាចត្រួតពិនិត្យស្ថានភាព database ពី browser នេះបានទេ។ អ្នកនៅតែអាចថត ហើយសាកល្បងរក្សាទុកបាន server នឹងបញ្ជាក់នៅពេលរក្សាទុកជោគជ័យ។
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {!savedMeetingId && audioUrl ? (
            <button
              className="mt-2 font-semibold underline"
              type="button"
              onClick={() => void saveMeetingAuto(audioUrl)}
            >
              សាកល្បងរក្សាទុកម្តងទៀត
            </button>
          ) : null}
        </div>
      ) : null}
      {quietWarning ? (
        <div className="mb-4 rounded-xl border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink">
          {quietWarning}
        </div>
      ) : null}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">ចំណងជើងប្រជុំ (ស្រេចចិត្ត)</span>
          <input
            className="kh-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={defaultMeetingTitle()}
            disabled={state === "recording" || state === "paused"}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">ភាសាបំលែងជាអក្សរ</span>
          <select
            className="kh-input"
            value={transcriptionLanguage}
            onChange={(event) => setTranscriptionLanguage(event.target.value as "km" | "en" | "km-en")}
            disabled={state === "recording" || state === "paused" || uploading}
          >
            <option value="km-en">ខ្មែរ + English (រក្សាភាសាដើម)</option>
            <option value="km">ខ្មែរ only (បកទាំងអស់ទៅខ្មែរ)</option>
            <option value="en">English only (translate all to English)</option>
          </select>
        </label>
      </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_240px]">
        <div className="block space-y-2">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-600">មីក្រូហ្វូន</span>
            <select
              className="kh-input"
              value={selectedDeviceId}
              onChange={(event) => rememberMicrophone(event.target.value)}
              disabled={state === "recording" || state === "paused" || uploading}
            >
              <option value="">មីក្រូហ្វូន default</option>
              {audioDevices.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {describeAudioDevice(device, index)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="kh-button-secondary justify-center px-3"
              type="button"
              onClick={() => void findMicrophones()}
              disabled={findingDevices || state === "recording" || state === "paused" || uploading}
            >
              {findingDevices ? "កំពុងរក..." : "រកមីក្រូហ្វូន"}
            </button>
            <button
              className="kh-button-secondary justify-center px-3"
              type="button"
              onClick={() => void connectBluetoothDevice()}
              disabled={findingDevices || state === "recording" || state === "paused" || uploading}
              title="បើកផ្ទាំង Bluetooth នៅលើ Chrome ឬ Edge"
            >
              Bluetooth
            </button>
          </div>
          <p className="text-xs text-slate-500">
            ដោតមៃខ្សែ ឬ USB receiver រួចចុច <strong>រកមីក្រូហ្វូន</strong>។ បើជា Bluetooth headset សូមភ្ជាប់ក្នុង Settings ជាមុន បន្ទាប់មកជ្រើសពីបញ្ជី។
          </p>
          {activeMicLabel && state !== "idle" ? (
            <p className="text-xs text-slate-500">
              កំពុងប្រើ៖ {activeMicLabel}
              {voiceProcessingActive ? " (បើកការបង្កើនសំឡេងស្វ័យប្រវត្តិរបស់ឧបករណ៍)" : ""}
            </p>
          ) : null}
          {audioDevices.length > 0 && !audioDevices.some((device) => device.label) ? (
            <p className="text-xs text-amber-700">
              ឈ្មោះមីក្រូហ្វូនមិនទាន់បង្ហាញទេ។ ចុច &quot;រកមីក្រូហ្វូន&quot; ដើម្បីអនុញ្ញាត mic ហើយបង្ហាញឈ្មោះពិត។
            </p>
          ) : null}
          {bluetoothNotice ? (
            <p
              className={`rounded-lg border p-3 text-xs leading-6 ${
                bluetoothNotice.tone === "ok" ? "border-leaf/30 bg-leaf/10 text-ink" : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              {bluetoothNotice.text}
            </p>
          ) : null}
          {detectedMics && detectedMics.length > 0 ? (
            <div className="rounded-lg border border-leaf/30 bg-leaf/10 p-3 text-xs leading-6 text-ink">
              <p className="font-semibold">រកឃើញ {detectedMics.length} មីក្រូហ្វូន។ សូមជ្រើសមួយពីបញ្ជីខាងលើ។</p>
              <ul className="ml-4 list-disc">
                {detectedMics.map((name, index) => (
                  <li key={`${name}-${index}`}>{name}</li>
                ))}
              </ul>
              <p className="text-slate-500">
                មិនប្រាកដថាមួយណា? ជ្រើសម្តងមួយៗ ហើយនិយាយសាក មើល Input level ខាងស្តាំ។
              </p>
              {/* Browsers can only list the microphones the operating system
                  exposes. A Bluetooth speaker has no microphone, and earbuds
                  or headsets connected only for music (stereo profile) expose
                  no microphone either until Windows switches them to
                  hands-free - so when nothing wireless is in the list, point
                  at the one place that decides it. */}
              {/* Hidden while a connect notice is showing: after a successful
                  connect it contradicts the ✅, and after a failed one the
                  notice already carries the same guidance. */}
              {!bluetoothNotice && !detectedMics.some((name) => name.startsWith("🎧") || name.startsWith("🎙️")) ? (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
                  <p className="font-semibold">មិនឃើញឈ្មោះ Bluetooth របស់អ្នកក្នុងបញ្ជីនេះមែនទេ?</p>
                  <p>
                    សូមពិនិត្យ <strong>Settings → System → Sound → Input</strong>។ បើមិនមាននៅទីនោះ app ក៏មិនអាចប្រើវាជាមីក្រូហ្វូនបានដែរ។
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          {detectedMics && detectedMics.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
              <p className="font-semibold">រកមិនឃើញមីក្រូហ្វូនណាមួយទេ។</p>
              <p>
                សូមដោតមៃខ្សែ/USB receiver ឬភ្ជាប់ Bluetooth headset ក្នុង Settings រួចចុច &quot;រកមីក្រូហ្វូន&quot; ម្តងទៀត។
              </p>
            </div>
          ) : null}
          {selectedBluetoothLabel ? (
            <p className="text-xs text-slate-500">
              Bluetooth បានជ្រើស៖ {selectedBluetoothLabel}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-600">កម្រិតសំឡេងចូល</p>
            {state === "recording" ? (
              <span className="text-xs font-semibold tabular-nums text-slate-500">
                {Math.round(micLevel * 100)}%
              </span>
            ) : null}
          </div>
          <div className="h-10 rounded-lg border border-slate-200 bg-white p-1.5 shadow-inner">
            <div
              className={`h-full rounded-md transition-all duration-150 ${
                state !== "recording" ? "bg-slate-200" : micLevel >= 0.025 ? "bg-leaf" : "bg-saffron"
              }`}
              style={{ width: state === "recording" ? `${Math.max(2, Math.round(micLevel * 100))}%` : "0%" }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {state === "recording"
              ? micLevel >= 0.025
                ? "សំឡេងចូលល្អ"
                : micLevel >= 0.008
                  ? "មានសំឡេងចូល ប៉ុន្តែនៅខ្សោយ"
                  : "សំឡេងខ្សោយខ្លាំង - សូមខិត microphone ឱ្យជិតកណ្ដាលតុ"
              : state === "paused"
                ? "ការថតត្រូវបានផ្អាក"
                : "ចាប់ផ្តើមថត ដើម្បីពិនិត្យកម្រិត microphone"}
          </p>
          {/* A phone cannot be inspected from a laptop. These are the numbers
              the device itself reports, so a "it is quiet on my phone" report
              can be answered with measurements instead of guesses. The raw
              figure is the microphone before any processing; the processed one
              is what actually gets recorded. */}
          {state === "recording" || state === "paused" ? (
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold">ព័ត៌មានបច្ចេកទេស (សម្រាប់រាយការណ៍បញ្ហា)</summary>
              <div className="mt-2 space-y-1">
                <p className="tabular-nums">
                  សំឡេងឆៅពីមីក្រូហ្វូន៖ <strong>{Math.round(rawMicLevel * 100)}%</strong>
                  {"  →  "}
                  ក្រោយកែ៖ <strong>{Math.round(micLevel * 100)}%</strong>
                </p>
                {rawMicLevel > 0.02 && micLevel < rawMicLevel * 0.8 ? (
                  <p className="font-semibold text-amber-700">
                    ការកែសំឡេងកំពុងធ្វើឱ្យសំឡេង​ខ្សោយជាងមុន — សូមប្រាប់ខ្ញុំលេខទាំងពីរនេះ។
                  </p>
                ) : null}
                {micDiagnostics.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-inner sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">ពេលវេលាថតសំឡេង</p>
          <p className="text-4xl font-bold tabular-nums text-ink">{formatTime(seconds)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {state === "recording" ? "កំពុងថត..." : state === "paused" ? "បានផ្អាក" : state === "stopped" ? "ថតរួចរាល់" : "រួចរាល់សម្រាប់ថត"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state === "idle" || state === "stopped" ? (
            <button className="kh-button-primary min-h-11" onClick={start} type="button"><Mic className="h-4 w-4" />ចាប់ផ្តើមថត</button>
          ) : null}
          {state === "recording" ? <button className="kh-button-secondary min-h-11" onClick={pause} type="button"><Pause className="h-4 w-4" />ផ្អាក</button> : null}
          {state === "paused" ? <button className="kh-button-secondary min-h-11" onClick={resume} type="button"><Play className="h-4 w-4" />បន្ត</button> : null}
          {state === "recording" || state === "paused" ? <button className="kh-button-secondary min-h-11" onClick={stop} type="button"><Square className="h-4 w-4" />បញ្ឈប់</button> : null}
        </div>
      </div>
      {state === "recording" ? (
        <button
          className="mt-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-slate-950 px-4 font-semibold text-white shadow-sm transition hover:bg-black"
          onClick={() => void enterQuietScreen()}
          type="button"
        >
          <Moon className="h-5 w-5" />
          បិទពន្លឺអេក្រង់ ខណៈកំពុងថត
        </button>
      ) : null}
      </div>
      {state === "stopped" ? (
        <div className="mt-6 space-y-4">
          {previewUrl ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-semibold text-ink">ស្តាប់សំឡេងដែលបានថត</p>
              <audio className="w-full" controls src={previewUrl} />
              <a
                className="kh-button-secondary mt-3 inline-flex"
                download={`khmermeet-${(title.trim() || "recording").replace(/[^\wក-៿-]+/g, "-")}.webm`}
                href={previewUrl}
              >
                ទាញយកឯកសារសំឡេង (Download)
              </a>
            </div>
          ) : null}
          {uploading ? (
            <p className="text-sm text-slate-500">កំពុង upload សំឡេង...</p>
          ) : savingMeeting ? (
            <p className="text-sm text-slate-500">កំពុងរក្សាទុកប្រជុំដោយស្វ័យប្រវត្តិ...</p>
          ) : savedMeetingId ? (
            <p className="flex items-center gap-2 text-sm text-leaf">
              <CheckCircle2 className="h-4 w-4" />
              បានរក្សាទុករួច។ <a className="font-semibold underline" href={`/meetings/${savedMeetingId}`}>មើលប្រជុំ</a>
            </p>
          ) : null}
          {transcriptionProgress ? <p className="text-sm text-slate-500">{transcriptionProgress}</p> : null}
          <button className="kh-button-secondary" onClick={start} type="button">
            <RotateCcw className="h-4 w-4" />
            ថតម្តងទៀត
          </button>
        </div>
      ) : null}
      </div>
      {quietScreenActive && state === "recording" ? (
        <div className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-between bg-black px-6 py-8 text-center text-white">
          <div className="flex w-full justify-end">
            <button
              aria-label="ត្រឡប់ពីអេក្រង់ងងឹត"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10 hover:text-white"
              onClick={() => void exitQuietScreen()}
              title="ត្រឡប់ទៅផ្ទាំងថត"
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div>
            <div className="mb-5 flex items-center justify-center gap-3 text-sm font-semibold text-white/70">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
              កំពុងថតសំឡេង
            </div>
            <p className="text-5xl font-semibold tabular-nums text-white/80 sm:text-6xl">{formatTime(seconds)}</p>
            <p className="mt-5 max-w-sm text-sm leading-6 text-white/45">
              អេក្រង់ត្រូវបានបន្ថយពន្លឺ ដើម្បីកុំឱ្យរំខានការប្រជុំ។ សូមកុំចាក់សោទូរស័ព្ទ។
            </p>
          </div>
          <div className="flex w-full max-w-sm gap-3">
            <button
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 font-semibold text-white/80"
              onClick={() => void exitQuietScreen()}
              type="button"
            >
              ត្រឡប់
            </button>
            <button
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-red-400/40 bg-red-950/50 px-4 font-semibold text-red-100"
              onClick={stop}
              type="button"
            >
              <Square className="h-4 w-4" />
              បញ្ឈប់
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
