"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { PlayerView, PublicPlayer } from "@/shared/types";
import { playerColor, initials } from "@/lib/colors";

type Send = (event: string, payload?: unknown) => void;

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

// ---- Player cosmetics ------------------------------------------------------

type StyleMap = Record<string, { frame?: string; color?: string }>;
const StylesContext = createContext<StyleMap>({});

/** Provide each player's chosen frame/colour to every Avatar below. */
export function PlayerStyles({ players, children }: { players: PublicPlayer[]; children: React.ReactNode }) {
  const map: StyleMap = {};
  for (const p of players) map[p.id] = { frame: p.frame, color: p.color };
  return <StylesContext.Provider value={map}>{children}</StylesContext.Provider>;
}

export function useStyle(id?: string): { frame?: string; color: string } {
  const styles = useContext(StylesContext);
  const s = id ? styles[id] : undefined;
  return { frame: s?.frame, color: s?.color ?? (id ? playerColor(id) : "#2a3356") };
}

const FRAME_STYLE: Record<string, React.CSSProperties> = {
  bronze: { boxShadow: "0 0 0 2px #cd7f32" },
  silver: { boxShadow: "0 0 0 2px #cfd8e3" },
  gold: { boxShadow: "0 0 0 2px #ffcf5c, 0 0 10px #ffcf5c88" },
  neon: { boxShadow: "0 0 0 2px #39d98a, 0 0 14px #39d98a" },
  rainbow: {
    boxShadow: "0 0 0 3px transparent",
    background: "conic-gradient(#ff6eb4,#ffcf5c,#39d98a,#59c3ff,#7c6cff,#ff6eb4)",
  },
};

/** Round avatar with the player's colour and unlocked frame. */
export function Avatar({
  name,
  seed,
  dim,
  size = 36,
}: {
  name: string;
  seed?: string;
  dim?: boolean;
  size?: number;
}) {
  const { frame, color } = useStyle(seed);
  const framed = frame && FRAME_STYLE[frame];
  const ringBg = framed && frame === "rainbow";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${dim ? "opacity-40" : ""}`}
      style={{
        width: size,
        height: size,
        padding: ringBg ? 3 : 0,
        ...(framed && !ringBg ? FRAME_STYLE[frame!] : {}),
        ...(ringBg ? { background: FRAME_STYLE.rainbow.background } : {}),
      }}
    >
      <span
        className="grid h-full w-full place-items-center rounded-full text-xs font-bold text-bg"
        style={{ background: seed ? color : "#2a3356" }}
      >
        {initials(name)}
      </span>
    </span>
  );
}

// ---- Player rows & moderation ---------------------------------------------

const REPORT_REASONS = [
  ["abusive", "Abusive"],
  ["cheating", "Cheating"],
  ["spam", "Spam"],
  ["other", "Other"],
] as const;

/** Small report control: pick a reason, send. */
export function ReportButton({ targetId, send }: { targetId: string; send: Send }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-panel2 hover:text-ink"
        aria-label="Report player"
      >
        Report
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {REPORT_REASONS.map(([id, label]) => (
        <button
          key={id}
          onClick={() => {
            send("player:report", { target: targetId, reason: id });
            setOpen(false);
          }}
          className="rounded-lg border border-line px-2 py-0.5 text-xs hover:border-bad hover:text-bad"
        >
          {label}
        </button>
      ))}
      <button onClick={() => setOpen(false)} className="px-1 text-xs text-muted" aria-label="Cancel report">
        ✕
      </button>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className={`truncate font-medium ${!p.alive ? "line-through text-muted" : ""}`}>
            {p.name}
          </span>
          {p.id === meId && <span className="chip bg-brand/20 text-brand">you</span>}
          {p.isHost && <span className="chip bg-warn/20 text-warn">host</span>}
          {p.muted && <span className="chip bg-bad/20 text-bad">muted</span>}
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

/** Host-only: mute or unmute players (blocks their chat and reactions). */
export function HostTools({ view, send }: { view: PlayerView; send: Send }) {
  const [open, setOpen] = useState(false);
  const others = view.room.players.filter((p) => p.id !== view.me.id);
  if (!view.me.isHost || others.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-1 text-sm text-muted"
      >
        <span>Host tools</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {others.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Avatar name={p.name} seed={p.id} size={28} />
              <span className="flex-1 truncate text-sm">{p.name}</span>
              <button
                onClick={() => send("player:mute", { target: p.id })}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  p.muted ? "border-bad text-bad" : "border-line text-muted hover:text-ink"
                }`}
              >
                {p.muted ? "Unmute" : "Mute"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Detective -------------------------------------------------------------

/** Detective's single peek: choose a player, learn if they share your word. */
export function DetectivePanel({ view, send }: { view: PlayerView; send: Send }) {
  const { me, room } = view;
  if (me.specialRole !== "detective" || !me.alive) return null;
  const peekedName = me.peek ? room.players.find((p) => p.id === me.peek!.target)?.name : null;

  return (
    <div className="rounded-xl border border-brand/40 bg-brand/10 p-3">
      <p className="font-display font-semibold text-brand">🔍 Detective</p>
      {me.peek ? (
        <p className="mt-1 text-sm">
          {peekedName} has{" "}
          <b className={me.peek.same ? "text-good" : "text-bad"}>
            {me.peek.same ? "the SAME word as you" : "a DIFFERENT word (or none)"}
          </b>
          .
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">One peek per game. Is their word the same as yours?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {room.players
              .filter((p) => p.alive && p.id !== me.id)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => send("detective:peek", { target: p.id })}
                  className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-sm hover:border-brand"
                >
                  {p.name}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Misc ------------------------------------------------------------------

const REACTIONS = ["🤔", "😂", "🚩", "👀", "🔥", "❤️"] as const;

/** Quick emoji reactions, broadcast to the room. */
export function ReactionBar({ send }: { send: Send }) {
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
export function MeetingButton({ used, send }: { used: boolean; send: Send }) {
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

/** Your word, always on screen during play, with a tap-to-hide toggle.
 *  Also shows the Jester / Detective role, which those players are told. */
export function WordBadge({
  word,
  isChameleon,
  specialRole,
}: {
  word: string | null;
  isChameleon: boolean;
  specialRole?: "jester" | "detective";
}) {
  const [hidden, setHidden] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      {specialRole && (
        <div
          className={`rounded-xl border px-4 py-2 text-center text-sm font-semibold ${
            specialRole === "jester"
              ? "border-warn/50 bg-warn/15 text-warn"
              : "border-brand/50 bg-brand/15 text-brand"
          }`}
        >
          {specialRole === "jester"
            ? "🃏 You are the Jester — get voted out to win!"
            : "🔍 You are the Detective — you play for the Civilians."}
        </div>
      )}
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
    </div>
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
