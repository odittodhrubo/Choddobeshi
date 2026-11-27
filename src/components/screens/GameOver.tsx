"use client";

import { useState } from "react";
import Link from "next/link";
import type { ScreenProps } from "@/components/types";
import { Banner, PlayerRow, Avatar, ReportButton } from "@/components/ui";
import { makeRecapImage, shareRecap } from "@/lib/share";

export default function GameOver({ view, send }: ScreenProps) {
  const { me, room } = view;
  const w = room.winner;
  const [tab, setTab] = useState<"roles" | "scores" | "recap">("roles");
  const byId = (id: string) => room.players.find((p) => p.id === id);
  const ranked = [...room.players]
    .map((p) => ({ p, score: room.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  const [sharing, setSharing] = useState(false);

  async function share() {
    setSharing(true);
    try {
      const blob = await makeRecapImage(view);
      if (blob) await shareRecap(blob);
    } finally {
      setSharing(false);
    }
  }

  const title =
    w?.team === "civilians"
      ? "🟢 Civilians win!"
      : w?.team === "guesser"
        ? "🎯 Correct guess — impostor wins!"
        : w?.team === "jester"
          ? `🃏 ${byId(w.playerIds[0])?.name ?? "The Jester"} wins — they got voted out!`
          : "🔴 Impostors win!";
  const tone =
    w?.team === "civilians" ? "good" : w?.team === "guesser" || w?.team === "jester" ? "warn" : "bad";

  const won = w?.playerIds.includes(me.id);
  const isQuestions = room.mode === "questions";

  return (
    <main className="flex flex-1 flex-col gap-5">
      <Banner tone={tone}>{title}</Banner>
      {won && <p className="text-center font-semibold text-good">You won! 🎉</p>}

      {isQuestions ? (
        <div className="card space-y-2 text-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Everyone&apos;s question</p>
            <p className="font-semibold text-brand">{room.civilianWord}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Imposter&apos;s question</p>
            <p className="font-semibold text-warn">{room.doppelgangerWord}</p>
          </div>
        </div>
      ) : (
        <div className="card space-y-1 text-center">
          <p className="text-sm text-muted">The words were</p>
          <p className="text-xl font-bold">
            <span className="text-brand">{room.civilianWord}</span>
            <span className="text-muted"> vs </span>
            <span className="text-warn">{room.doppelgangerWord}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["roles", "Roles"],
            ["scores", "Scores"],
            ["recap", "Recap"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`min-h-0 rounded-xl border-2 px-2 py-1.5 text-sm font-semibold transition ${
              tab === id ? "border-brand bg-brand/20 text-white" : "border-line bg-panel2 text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="flex-1 space-y-2 overflow-y-auto">
        {tab === "roles" &&
          room.players.map((p) => (
            <PlayerRow
              key={p.id}
              p={p}
              meId={me.id}
              right={p.id !== me.id ? <ReportButton targetId={p.id} send={send} /> : undefined}
            />
          ))}

        {tab === "scores" &&
          ranked.map((r, i) => (
            <div key={r.p.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel2/50 px-3 py-2">
              <span className="w-6 text-center">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
              <Avatar name={r.p.name} seed={r.p.id} />
              <span className="flex-1 truncate font-medium">{r.p.name}</span>
              <span className="font-display font-bold text-brand">{r.score}</span>
            </div>
          ))}

        {tab === "recap" && (
          <div className="space-y-3">
            {!isQuestions &&
              Array.from({ length: room.round }, (_, i) => i + 1).map((rnd) => (
                <div key={rnd}>
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted">Round {rnd} clues</p>
                  {room.clues.filter((c) => c.round === rnd).map((c, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="w-24 shrink-0 truncate text-muted">{byId(c.playerId)?.name}</span>
                      <span className="font-medium">{c.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            {isQuestions &&
              (room.answerRounds ?? []).map((r, i) => (
                <div key={i}>
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted">Round {i + 1} answers</p>
                  {room.players.map((p) => (
                    <div key={p.id} className="flex gap-2 text-sm">
                      <span className="w-24 shrink-0 truncate text-muted">{p.name}</span>
                      <span className="font-medium">{r[p.id] ?? "—"}</span>
                    </div>
                  ))}
                </div>
              ))}
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">Votes</p>
              {(room.voteLog ?? []).map((v, i) => (
                <div key={i} className="mb-2">
                  <p className="text-sm">
                    <span className="text-muted">Round {v.round}: </span>
                    {v.eliminatedId ? `${byId(v.eliminatedId)?.name} voted out` : "No one voted out"}
                  </p>
                  <p className="text-xs text-muted">
                    {Object.entries(v.votes ?? {})
                      .map(
                        ([voter, t]) =>
                          `${byId(voter)?.name ?? "?"} → ${t === "skip" ? "skip" : byId(t)?.name ?? "?"}`,
                      )
                      .join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <button className="btn-ghost" onClick={share} disabled={sharing}>
        {sharing ? "Preparing…" : "📸 Share result"}
      </button>

      {me.isHost ? (
        <>
          <button className="btn-primary" onClick={() => send("game:again")}>
            Play again
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              if (confirm("End the match and close the room for everyone?")) send("room:close");
            }}
          >
            End match &amp; close room
          </button>
        </>
      ) : (
        <p className="text-center text-muted">Waiting for the host to restart…</p>
      )}
      <Link href="/" className="text-center text-sm text-muted hover:underline">
        Leave game
      </Link>
    </main>
  );
}
