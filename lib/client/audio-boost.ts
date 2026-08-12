"use client";

export type BoostedAudioStream = {
  stream: MediaStream;
  cleanup: () => void;
};

// getUserMedia's autoGainControl normalizes overall volume but isn't
// aggressive enough to make a speaker seated far from the microphone as
// intelligible as someone talking right into it. A DynamicsCompressorNode
// raises quiet signal and caps loud signal (evening out near vs. far
// speakers), followed by a fixed gain stage for extra headroom on top of
// that. Feed the returned stream to MediaRecorder instead of the raw one.
export function boostAudioStream(sourceStream: MediaStream): BoostedAudioStream {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(sourceStream);
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -50;
  compressor.knee.value = 40;
  compressor.ratio.value = 12;
  compressor.attack.value = 0;
  compressor.release.value = 0.25;
  const gain = audioContext.createGain();
  gain.gain.value = 1.8;
  const destination = audioContext.createMediaStreamDestination();

  source.connect(compressor);
  compressor.connect(gain);
  gain.connect(destination);

  return {
    stream: destination.stream,
    cleanup: () => {
      source.disconnect();
      compressor.disconnect();
      gain.disconnect();
      void audioContext.close().catch(() => undefined);
    }
  };
}
