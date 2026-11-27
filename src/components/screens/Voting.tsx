"use client";

import { useState } from "react";
import type { ChatScreenProps } from "@/components/types";
import { Timer, DetectivePanel, useStyle } from "@/components/ui";
import ChatBox from "@/components/ChatBox";

/** Suspect-file avatar: initials disc with a coloured ring and a faint fingerprint. */
function SuspectFace({ name, id }: { name: string; id: string }) {
  const { color } = useStyle(id);
  return (
    <span className="relative grid h-16 w-16 place-items-center">
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full opacity-20" fill="none"
        stroke={color} strokeWidth="1.2" strokeLinecap="round">
        <path d="M12 4a8 8 0 0 0-8 8M12 7a5 5 0 0 0-5 5M12 10a2 2 0 0 0-2 2M20 12a8 8 0 0 0-4-7M17 13a5 5 0 0 0-2-4" />
      </svg>
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl font-display text-xl font-bold text-bg"
        style={{ background: color, boxShadow: `0 4px 0 0 ${color}99` }}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    </span>
  );
}

export default function Voting({ view, send, chat }: ChatScreenProps) {
  const { me, room } = view;
  const alive = room.players.filter((p) => p.alive);
  const votedCount = room.players.filter((p) => p.hasVoted).length;

  // The server tells me my own saved vote, so this survives a refresh.
  const [localPick, setLocalPick] = useState<string | null>(null);
  const pick = localPick ?? me.myVote ?? null;
  const saved = !!pick && me.myVote === pick;
  const everyoneVoted = votedCount === alive.length;

  function confirm() {
    if (!me.alive || !pick) return;
    send("vote:cast", { target: pick });
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <header className="animate-pop rounded-2xl border-2 border-bad/50 bg-bad/15 px-4 py-3 text-center">
        <h1 className="font-display text-2xl font-bold tracking-wide text-bad">SUSPECT LINEUP</h1>
        <p className="text-sm text-ink/80">Tap who you think is lying.</p>
      </header>

      <div className="flex items-center justify-between px-1 text-sm">
        <span className="chip bg-panel2 text-muted">Round {room.round}</span>
        <span className="text-muted">{votedCount}/{alive.length} voted</span>
        <Timer endsAt={room.phaseEndsAt} />
      </div>

      {everyoneVoted && (
        <p className="text-center text-sm text-warn">Everyone has voted — last chance to change your mind.</p>
      )}

      <DetectivePanel view={view} send={send} />

      <section className="grid flex-1 grid-cols-2 gap-2.5 overflow-y-auto pb-1">
        {alive.map((p) => {
          const selected = pick === p.id;
          return (
            <button
              key={p.id}
              disabled={!me.alive}
              onClick={() => setLocalPick(p.id)}
              className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition
                ${selected ? "border-bad bg-bad/10 scale-[1.02]" : "border-line bg-panel2/70 hover:border-brand/50"}
                disabled:opacity-50`}
            >
              {p.hasVoted && (
                <span className="absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-good text-xs font-bold text-bg">✓</span>
              )}
              {selected && (
                <span className="animate-pop pointer-events-none absolute right-1.5 top-1.5 z-10 rotate-[8deg] rounded-md
                                 border-2 border-bad bg-bg/80 px-2 py-0.5 font-display text-xs font-bold uppercase tracking-wider text-bad">
                  Sus
                </span>
              )}
              <SuspectFace name={p.name} id={p.id} />
              <span className="w-full truncate text-center text-sm font-semibold">
                {p.name}
                {p.id === me.id && <span className="ml-1 text-xs text-brand">(you)</span>}
              </span>
            </button>
          );
        })}
      </section>

      <button
        onClick={() => setLocalPick("skip")}
        disabled={!me.alive}
        className={`btn w-full border-2 ${pick === "skip" ? "border-warn bg-warn/20 text-warn" : "border-line bg-panel2 text-muted"}`}
      >
        🙈 Skip vote
      </button>

      {me.alive ? (
        <>
          <button className="btn-primary" disabled={!pick || saved} onClick={confirm}>
            {saved
              ? "✓ Vote saved"
              : pick === "skip"
                ? "Confirm skip"
                : pick
                  ? `${me.myVote ? "Change vote to" : "Vote out"} ${room.players.find((p) => p.id === pick)?.name ?? ""}`
                  : "Pick someone to vote"}
          </button>
          {saved && (
            <p className="text-center text-xs text-muted">You can change your vote until the timer ends.</p>
          )}
        </>
      ) : (
        <p className="text-center text-sm text-muted">👻 Ghosts cannot vote.</p>
      )}

      <ChatBox chat={chat} send={send} ghost={!me.alive} />
    </main>
  );
}
