"use client";

import { useState } from "react";
import type { ScreenProps } from "@/components/types";
import { Banner, Timer } from "@/components/ui";

export default function LastGuess({ view, send }: ScreenProps) {
  const { me, room } = view;
  const guesser = room.guesserId
    ? room.players.find((p) => p.id === room.guesserId)
    : null;
  const iAmGuesser = room.guesserId === me.id;
  const [text, setText] = useState("");

  function submit() {
    const t = text.trim();
    if (!t) return;
    send("guess:submit", { text: t });
    setText("");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      {iAmGuesser ? (
        <>
          <Banner tone="warn">You were caught! One last chance.</Banner>
          <p className="text-muted">
            Guess the <span className="text-brand font-semibold">Civilians&apos; word</span> to
            win the whole game.
          </p>
          <div className="flex w-full gap-2">
            <input
              autoFocus
              className="input"
              value={text}
              maxLength={40}
              placeholder="The secret word…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <button className="btn-primary shrink-0" onClick={submit}>
              Guess
            </button>
          </div>
          <Timer endsAt={room.phaseEndsAt} label="Time left" />
        </>
      ) : (
        <>
          <Banner tone="brand">
            {guesser?.name ?? "Someone"} is making a final guess…
          </Banner>
          <Timer endsAt={room.phaseEndsAt} />
          {me.isHost && (
            <button className="btn-ghost" onClick={() => send("guess:accept")}>
              Accept their guess (synonym)
            </button>
          )}
        </>
      )}
    </main>
  );
}
