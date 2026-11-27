"use client";

import { useState } from "react";
import type { ScreenProps } from "@/components/types";
import { Timer, Avatar } from "@/components/ui";

export default function Answer({ view, send }: ScreenProps) {
  const { me, room } = view;
  const [text, setText] = useState("");
  const iAnswered = room.players.find((p) => p.id === me.id)?.hasAnswered;
  const answeredCount = room.players.filter((p) => p.hasAnswered).length;
  const aliveCount = room.players.filter((p) => p.alive).length;
  const totalRounds = room.settings.questionRounds;
  const earlier = room.answerRounds ?? [];
  const byId = (id: string) => room.players.find((p) => p.id === id);

  function submit() {
    const t = text.trim();
    if (!t) return;
    send("answer:submit", { text: t });
    setText("");
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="chip bg-panel2 text-muted">
          Round {room.round} of {totalRounds}
        </span>
        <Timer endsAt={room.phaseEndsAt} />
      </div>

      <section className="card text-center">
        <p className="text-sm text-muted">Your question</p>
        <p className="mt-1 font-display text-2xl font-bold leading-snug text-brand">{me.word}</p>
      </section>

      {me.alive && !iAnswered ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className="input"
            value={text}
            maxLength={60}
            placeholder={earlier.length ? "A new answer (no repeats)…" : "Your answer…"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button className="btn-primary shrink-0" onClick={submit}>
            Send
          </button>
        </div>
      ) : (
        <p className="text-center font-semibold text-good">
          {me.alive ? "✓ Answer locked in" : "👻 Watching"}
        </p>
      )}

      <p className="text-center text-sm text-muted">{answeredCount}/{aliveCount} answered</p>

      {earlier.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted">Earlier answers</p>
          {earlier.map((r, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel2/40 px-3 py-2">
              <p className="mb-1 text-xs text-muted">Round {i + 1}</p>
              {room.players
                .filter((p) => p.alive || r[p.id])
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 truncate text-muted">{byId(p.id)?.name}</span>
                    <span className="font-medium">{r[p.id] ?? "—"}</span>
                  </div>
                ))}
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {room.players.filter((p) => p.alive).map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel2/50 px-3 py-2">
            <Avatar name={p.name} seed={p.id} />
            <span className="flex-1 truncate font-medium">{p.name}</span>
            {p.hasAnswered ? (
              <span className="chip bg-good/20 text-good">answered</span>
            ) : (
              <span className="text-sm text-muted">thinking…</span>
            )}
          </div>
        ))}
      </section>

      {me.isHost && (
        <button className="btn-ghost" onClick={() => send("answer:skip")}>
          Skip waiting (AFK) →
        </button>
      )}
    </main>
  );
}
