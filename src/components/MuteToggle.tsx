"use client";

import { useEffect, useState } from "react";
import { isMuted, setMuted } from "@/lib/sfx";

export default function MuteToggle() {
  const [muted, setM] = useState(false);
  useEffect(() => setM(isMuted()), []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setM(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      className="fixed right-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-full border-2 border-line
                 bg-panel/80 text-lg backdrop-blur transition hover:border-brand/60"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
