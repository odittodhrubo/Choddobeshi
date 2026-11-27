"use client";

import type { ScreenProps } from "@/components/types";
import { Banner, Timer } from "@/components/ui";

export default function Ejection({ view }: ScreenProps) {
  const { room } = view;
  const ejected = room.lastEliminated
    ? room.players.find((p) => p.id === room.lastEliminated)
    : null;

  const tally = room.voteTally ?? {};
  const rows = Object.entries(tally)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const label = (key: string) =>
    key === "skip" ? "Skip" : room.players.find((p) => p.id === key)?.name ?? "?";

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

      <Timer endsAt={room.phaseEndsAt} label="Next" />
    </main>
  );
}
