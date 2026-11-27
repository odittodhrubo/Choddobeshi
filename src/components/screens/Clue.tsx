"use client";

import { useState } from "react";
import type { ScreenProps } from "@/components/types";
import { Timer, WordBadge, Avatar, MeetingButton, DetectivePanel } from "@/components/ui";

export default function Clue({ view, send }: ScreenProps) {
  const { me, room } = view;
  const [text, setText] = useState("");

  const speakerId = room.turnOrder[room.turnIndex];
  const isMyTurn = speakerId === me.id && me.alive;
  const byId = (id: string) => room.players.find((p) => p.id === id);
  const roundClues = room.clues.filter((c) => c.round === room.round);

  function submit() {
    const t = text.trim();
    if (!t) return;
    send("clue:submit", { text: t });
    setText("");
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="chip bg-panel2 text-muted">Round {room.round}</span>
        <Timer endsAt={room.phaseEndsAt} />
      </div>

      <WordBadge word={me.word} isChameleon={me.isChameleon} specialRole={me.specialRole} />

      <DetectivePanel view={view} send={send} />

      <section className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {room.turnOrder.map((id, i) => {
          const p = byId(id);
          if (!p) return null;
          const clue = roundClues.find((c) => c.playerId === id);
          const current = i === room.turnIndex && !clue;
          return (
            <div
              key={id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                current ? "border-brand bg-brand/10" : "border-line bg-panel2/50"
              }`}
            >
              <Avatar name={p.name} seed={p.id} />
              <span className="flex-1 truncate font-medium">
                {p.name}
                {id === me.id && <span className="ml-2 text-xs text-brand">you</span>}
              </span>
              {clue ? (
                <span className="font-semibold text-ink">{clue.text}</span>
              ) : current ? (
                <span className="text-sm text-brand">thinking…</span>
              ) : (
                <span className="text-sm text-muted">waiting</span>
              )}
            </div>
          );
        })}
      </section>

      {isMyTurn ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className="input"
            value={text}
            maxLength={30}
            placeholder="One word…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button className="btn-primary shrink-0" onClick={submit}>
            Send
          </button>
        </div>
      ) : (
        <p className="text-center text-muted">
          {me.alive ? `Waiting for ${byId(speakerId)?.name ?? "…"}` : "You are out — watching"}
        </p>
      )}

      {me.alive && (
        <MeetingButton used={room.emergencyUsedBy.includes(me.id)} send={send} />
      )}

      {me.isHost && !isMyTurn && (
        <button className="btn-ghost" onClick={() => send("turn:skip")}>
          Skip {byId(speakerId)?.name ?? "this"}&apos;s turn (AFK)
        </button>
      )}
    </main>
  );
}
