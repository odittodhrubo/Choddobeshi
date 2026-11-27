"use client";

import type { ScreenProps } from "@/components/types";
import { Banner, Timer, Avatar } from "@/components/ui";

export default function Ejection({ view }: ScreenProps) {
  const { room } = view;
  const byId = (id: string) => room.players.find((p) => p.id === id);
  const ejected = room.lastEliminated ? byId(room.lastEliminated) : null;

  const tally = room.voteTally ?? {};
  const rows = Object.entries(tally)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const label = (key: string) => (key === "skip" ? "Skip" : byId(key)?.name ?? "?");

  // Who voted for whom, revealed now that voting is closed.
  const votes = Object.entries(room.lastVotes ?? {});

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      {ejected ? (
        <Banner tone="bad">
          {ejected.name} was voted out
          {ejected.revealedRole && (
            <span className="block text-sm font-normal capitalize opacity-80">
              they were the {ejected.revealedRole}
            </span>
          )}
        </Banner>
      ) : (
        <Banner tone="warn">No one was voted out</Banner>
      )}

      <div className="w-full space-y-2 text-left">
        {rows.map(([key, n]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-sm">{label(key)}</span>
            <div className="flex flex-1 gap-1">
              {Array.from({ length: n }).map((_, i) => (
                <span key={i} className="h-3 w-3 rounded-full bg-brand" />
              ))}
            </div>
            <span className="text-sm text-muted">{n}</span>
          </div>
        ))}
      </div>

      {votes.length > 0 && (
        <section className="w-full rounded-2xl border border-line bg-panel2/40 p-3 text-left">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Who voted for whom</p>
          <div className="space-y-1.5">
            {votes.map(([voter, target]) => (
              <div key={voter} className="flex items-center gap-2 text-sm">
                <Avatar name={byId(voter)?.name ?? "?"} seed={voter} size={24} />
                <span className="w-20 shrink-0 truncate">{byId(voter)?.name}</span>
                <span className="text-muted">→</span>
                <span className={`flex-1 truncate font-semibold ${target === "skip" ? "text-warn" : ""}`}>
                  {label(target)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Timer endsAt={room.phaseEndsAt} label="Next" />
    </main>
  );
}
