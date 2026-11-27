"use client";

import { useState } from "react";
import type { ScreenProps } from "@/components/types";
import { Timer } from "@/components/ui";

export default function RoleReveal({ view, send }: ScreenProps) {
  const { me, room } = view;
  const [peeking, setPeeking] = useState(false);
  const isQuestions = room.mode === "questions";

  const connected = room.players.filter((p) => p.connected);
  const readyCount = connected.filter((p) => p.ready).length;
  const iAmReady = !!room.players.find((p) => p.id === me.id)?.ready;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <p className="text-muted">Your secret card</p>

      <button
        className="card relative flex h-64 w-full select-none flex-col items-center justify-center gap-3"
        onPointerDown={() => setPeeking(true)}
        onPointerUp={() => setPeeking(false)}
        onPointerLeave={() => setPeeking(false)}
      >
        {peeking ? (
          me.isChameleon ? (
            <>
              <span className="text-5xl">🦎</span>
              <span className="text-2xl font-black text-warn">You are the Chameleon</span>
              <span className="text-sm text-muted">You have no word. Blend in.</span>
            </>
          ) : isQuestions ? (
            <>
              <span className="text-sm text-muted">Your question</span>
              <span className="px-3 text-center font-display text-2xl font-bold leading-snug text-brand">
                {me.word}
              </span>
            </>
          ) : (
            <>
              {me.specialRole === "jester" && (
                <span className="text-sm font-semibold text-warn">🃏 You are the Jester — get voted out!</span>
              )}
              {me.specialRole === "detective" && (
                <span className="text-sm font-semibold text-brand">🔍 You are the Detective</span>
              )}
              <span className="text-sm text-muted">Your word is</span>
              <span className="font-display text-4xl font-bold text-brand">{me.word}</span>
            </>
          )
        ) : (
          <>
            <span className="text-5xl">🔒</span>
            <span className="text-lg font-semibold">Hold to peek</span>
            <span className="text-sm text-muted">Keep it hidden from others</span>
          </>
        )}
      </button>

      <button className="btn-primary w-full" disabled={iAmReady} onClick={() => send("ready:set")}>
        {iAmReady ? "✓ Ready — waiting for others" : "I'm ready"}
      </button>
      <p className="text-sm text-muted">
        {readyCount}/{connected.length} ready · starts when everyone is ready
      </p>
      <Timer endsAt={room.phaseEndsAt} label="Auto-start in" />
    </main>
  );
}
