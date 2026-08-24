"use client";

import { useState } from "react";

export function RecordedAudioPlayer({ src, label, audioId }: { src: string; label?: string; audioId?: string }) {
  const [error, setError] = useState("");

  return (
    <div className="space-y-1">
      {label ? <p className="text-xs font-semibold text-slate-600">{label}</p> : null}
      <audio
        id={audioId}
        className="w-full"
        controls
        preload="metadata"
        src={src}
        onCanPlay={() => setError("")}
        onError={() => setError("The audio file cannot play in the player. Open the audio directly.")}
      />
      {error ? (
        <p className="text-xs text-red-600">
          {error}{" "}
          <a className="font-semibold underline" href={src} rel="noreferrer" target="_blank">
            Open audio
          </a>
        </p>
      ) : null}
    </div>
  );
}
