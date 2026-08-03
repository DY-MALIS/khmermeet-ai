// Shared id for the meeting recording's <audio> element, so features like Ask
// Meeting and AI Timeline (rendered as separate components) can seek/play it
// without needing shared React state across the server/client boundary.
export const AUDIO_PLAYER_ELEMENT_ID = "meeting-audio-player";

export function seekAudioPlayer(startMs: number) {
  const player = document.getElementById(AUDIO_PLAYER_ELEMENT_ID);
  if (!(player instanceof HTMLAudioElement)) return;
  player.currentTime = startMs / 1000;
  void player.play();
}
