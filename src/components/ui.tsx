"use client";

import { useEffect, useState } from "react";
import type { PublicPlayer } from "@/shared/types";
import { playerColor, initials } from "@/lib/colors";

/** Live countdown from a server deadline (ms epoch). */
export function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endsAt == null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function Timer({ endsAt, label }: { endsAt: number | null; label?: string }) {
  const s = useCountdown(endsAt);
  if (s == null) return null;
  const danger = s <= 5;
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      {label && <span className="text-muted">{label}</span>}
      <span
        className={`tabular-nums font-bold ${danger ? "text-bad" : "text-ink"}`}
        aria-live="polite"
      >
        {s}s
      </span>
    </div>
  );
}

export function Avatar({ name, seed, dim }: { name: string; seed?: string; dim?: boolean }) {
  const color = seed ? playerColor(seed) : "#2a3356";
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-bg ${dim ? "opacity-40" : ""}`}
      style={seed ? { background: color } : undefined}
    >
      {initials(name)}
    </span>
  );
}

export function PlayerRow({
  p,
  meId,
  right,
}: {
  p: PublicPlayer;
  meId: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel2/60 px-3 py-2">
      <Avatar name={p.name} seed={p.id} dim={!p.alive} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate font-medium ${!p.alive ? "line-through text-muted" : ""}`}>
            {p.name}
          </span>
          {p.id === meId && <span className="chip bg-brand/20 text-brand">you</span>}
          {p.isHost && <span className="chip bg-warn/20 text-warn">host</span>}
          {!p.connected && <span className="chip bg-line text-muted">offline</span>}
        </div>
        {p.revealedRole && (
          <span className="text-xs text-muted capitalize">{p.revealedRole}</span>
        )}
      </div>
      {right}
    </div>
  );
}

const REACTIONS = ["🤔", "😂", "🚩", "👀", "🔥", "❤️"] as const;

/** Quick emoji reactions, broadcast to the room. */
export function ReactionBar({ send }: { send: (event: string, payload?: unknown) => void }) {
  return (
    <div className="flex justify-center gap-1.5">
      {REACTIONS.map((e) => (
        <button
          key={e}
          onClick={() => send("react", { emoji: e })}
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel2/70 text-lg
                     transition active:scale-90 hover:border-brand/60"
          aria-label={`React ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** Emergency meeting: force a vote (classic mode, once per player per game). */
export function MeetingButton({
  used,
  send,
}: {
  used: boolean;
  send: (event: string, payload?: unknown) => void;
}) {
  return (
    <button
      disabled={used}
      onClick={() => send("meeting:call")}
      className="btn-danger w-full disabled:opacity-40"
    >
      {used ? "Meeting used" : "🚨 Call emergency meeting"}
    </button>
  );
}

/** Your word, always on screen during play, with a tap-to-hide toggle. */
export function WordBadge({ word, isChameleon }: { word: string | null; isChameleon: boolean }) {
  const [hidden, setHidden] = useState(false);
  return (
    <button
      onClick={() => setHidden((h) => !h)}
      className="flex w-full items-center justify-between rounded-xl border border-line bg-panel2/70 px-4 py-2.5"
    >
      <span className="text-xs uppercase tracking-wide text-muted">
        {isChameleon ? "You are the" : "Your word"}
      </span>
      <span className={`text-lg font-bold ${isChameleon ? "text-warn" : "text-brand"}`}>
        {hidden ? "••••••" : isChameleon ? "Chameleon 🦎" : word}
      </span>
    </button>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "good" | "bad" | "warn" | "brand";
  children: React.ReactNode;
}) {
  const map = {
    good: "bg-good/15 text-good border-good/40",
    bad: "bg-bad/15 text-bad border-bad/40",
    warn: "bg-warn/15 text-warn border-warn/40",
    brand: "bg-brand/15 text-brand border-brand/40",
  } as const;
  return (
    <div className={`rounded-xl border px-4 py-3 text-center font-semibold ${map[tone]}`}>
      {children}
    </div>
  );
}
