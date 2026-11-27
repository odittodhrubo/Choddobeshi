"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { ScreenProps } from "@/components/types";
import { WORD_PACKS, featuredPack } from "@/shared/types";
import { PlayerRow, Avatar, ReportButton } from "@/components/ui";

export default function Lobby({ view, send }: ScreenProps) {
  const { me, room } = view;
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string>("");
  const [showQr, setShowQr] = useState(false);
  const [starting, setStarting] = useState(false);
  const n = room.players.length;

  useEffect(() => {
    const url = `${location.origin}/room/${room.code}`;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0b0f1a", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [room.code]);
  const isQuestions = room.settings.mode === "questions";
  const { d, c } = resolveCounts(n, room.settings);
  const j = room.settings.jester ? 1 : 0;
  const det = room.settings.detective ? 1 : 0;
  const civTeam = n - d - c - j; // civilians + detective
  const rolesOk =
    isQuestions || (d + c >= 1 && civTeam - det >= 1 && d + c < civTeam);
  const daily = featuredPack();
  const isCustom = room.settings.wordPack === "custom";
  const customReady =
    !isCustom ||
    (isQuestions
      ? !!room.settings.customQuestion?.civilian && !!room.settings.customQuestion?.imposter
      : !!room.settings.customWord?.civilian && !!room.settings.customWord?.doppelganger);
  const canStart = n >= 4 && rolesOk && customReady;

  function share() {
    const url = `${location.origin}/room/${room.code}`;
    if (navigator.share) {
      navigator.share({ title: "Choddobeshi", text: "Join my game!", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }

  function setNum(
    key:
      | "clueSeconds"
      | "discussionSeconds"
      | "voteSeconds"
      | "guessSeconds"
      | "maxRounds"
      | "scoreCivilian"
      | "scoreImpostor"
      | "scoreGuesser"
      | "scoreJester"
      | "questionRounds",
    v: number,
  ) {
    send("room:settings", { [key]: v });
  }

  const DIFFS: { id: "easy" | "medium" | "hard" | "mixed"; label: string; hint: string }[] = [
    { id: "easy", label: "Easy", hint: "Words far apart — impostors stick out" },
    { id: "medium", label: "Medium", hint: "A fair challenge" },
    { id: "hard", label: "Hard", hint: "Near-twin words — tough to spot" },
    { id: "mixed", label: "Mixed", hint: "A bit of everything" },
  ];
  const activeDiff = DIFFS.find((d) => d.id === room.settings.difficulty) ?? DIFFS[3];

  return (
    <main className="flex flex-1 flex-col gap-5">
      <header className="text-center">
        <p className="text-sm text-muted">Room code</p>
        <button onClick={share} className="mt-1 font-display text-5xl font-bold tracking-[0.3em] text-brand">
          {room.code}
        </button>
        <div className="mt-2 flex items-center justify-center gap-3 text-sm">
          <span className="text-brand">{copied ? "Link copied!" : "Tap code to share"}</span>
          {qr && (
            <button onClick={() => setShowQr((v) => !v)} className="text-muted underline">
              {showQr ? "Hide QR" : "Show QR"}
            </button>
          )}
        </div>
        {showQr && qr && (
          <div className="mt-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Join QR code" className="animate-pop h-44 w-44 rounded-2xl border-4 border-white" />
          </div>
        )}
      </header>

      {room.gamesPlayed > 0 && <Leaderboard view={view} />}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Players</h2>
          <span className="text-sm text-muted">{room.players.length}/12</span>
        </div>
        {room.players.map((p) => (
          <PlayerRow
            key={p.id}
            p={p}
            meId={me.id}
            right={
              p.id === me.id ? undefined : (
                <span className="flex items-center gap-1">
                  {me.isHost && (
                    <>
                      <button
                        onClick={() => send("player:kick", { target: p.id })}
                        aria-label={`Remove ${p.name}`}
                        className="rounded-lg px-2 py-1 text-sm text-bad hover:bg-bad/15"
                      >
                        Kick
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Ban ${p.name}? They cannot rejoin this room.`))
                            send("player:ban", { target: p.id });
                        }}
                        aria-label={`Ban ${p.name}`}
                        className="rounded-lg px-2 py-1 text-sm text-bad hover:bg-bad/15"
                      >
                        Ban
                      </button>
                    </>
                  )}
                  <ReportButton targetId={p.id} send={send} />
                </span>
              )
            }
          />
        ))}
        {n < 4 && (
          <p className="text-center text-sm text-muted">Waiting for {4 - room.players.length} more…</p>
        )}
      </section>

      {me.isHost && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-semibold">Game mode</h2>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "classic", title: "Classic", hint: "Secret word + hidden roles" },
                { id: "questions", title: "Questions", hint: "Odd question out" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => send("room:settings", { mode: m.id })}
                className={`flex flex-col items-start gap-0.5 rounded-xl border-2 px-3 py-2.5 text-left transition ${
                  room.settings.mode === m.id
                    ? "border-brand bg-brand/20"
                    : "border-line bg-panel2 hover:border-brand/50"
                }`}
              >
                <span className="font-display font-semibold">{m.title}</span>
                <span className="text-xs text-muted">{m.hint}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {me.isHost && isQuestions && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-semibold">Questions source</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: "questions-general", label: "Preset" },
                { id: "ai", label: "AI ✨" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((o) => {
              const active =
                o.id === "custom"
                  ? room.settings.wordPack === "custom"
                  : o.id === "ai"
                    ? room.settings.wordPack === "ai"
                    : room.settings.wordPack !== "custom" && room.settings.wordPack !== "ai";
              return (
                <button
                  key={o.id}
                  onClick={() => send("room:settings", { wordPack: o.id === "questions-general" ? "en-general" : o.id })}
                  className={`min-h-0 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition ${
                    active ? "border-brand bg-brand/20 text-white" : "border-line bg-panel2 text-muted hover:text-ink"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            {room.settings.wordPack === "ai"
              ? "A fresh question pair is generated by AI each game."
              : room.settings.wordPack === "custom"
                ? "Write your own question pair below."
                : "Everyone gets the same question — the imposter gets a sneaky different one. Imposters: " +
                  (n >= 8 ? 2 : 1) + "."}
          </p>
        </section>
      )}

      {me.isHost && isQuestions && room.settings.wordPack === "custom" && (
        <CustomQuestionForm view={view} send={send} />
      )}

      {me.isHost && !isQuestions && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-semibold">Word pack</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {WORD_PACKS.map((wp) => (
              <button
                key={wp.id}
                onClick={() => send("room:settings", { wordPack: wp.id })}
                className={`min-h-0 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition ${
                  room.settings.wordPack === wp.id
                    ? "border-brand bg-brand/20 text-white"
                    : "border-line bg-panel2 text-muted hover:text-ink"
                }`}
              >
                {wp.name}
                {wp.id === daily && <span title="Daily pack: winners earn +1 point"> ⭐</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            ⭐ Today&apos;s daily pack: winners earn +1 bonus point.
          </p>

          {room.settings.wordPack === "custom" ? (
            <CustomWordForm view={view} send={send} />
          ) : (
            <>
              <h2 className="mt-1 font-display font-semibold">Difficulty</h2>
              <div className="grid grid-cols-4 gap-1.5">
                {DIFFS.map((dd) => (
                  <button
                    key={dd.id}
                    onClick={() => send("room:settings", { difficulty: dd.id })}
                    className={`min-h-0 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition ${
                      room.settings.difficulty === dd.id
                        ? "border-brand bg-brand/20 text-white"
                        : "border-line bg-panel2 text-muted hover:text-ink"
                    }`}
                  >
                    {dd.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">{activeDiff.hint}</p>
            </>
          )}
        </section>
      )}

      {me.isHost && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-semibold">Timers &amp; rounds</h2>
          <Setting label={isQuestions ? "Answer timer" : "Clue timer"} value={room.settings.clueSeconds} opts={[15, 30, 45, 60]} min={10} max={120} unit="s"
            onChange={(v) => setNum("clueSeconds", v)} />
          <Setting label="Discussion" value={room.settings.discussionSeconds} opts={[0, 30, 60, 90]} min={0} max={300} unit="s"
            onChange={(v) => setNum("discussionSeconds", v)} />
          <Setting label="Vote timer" value={room.settings.voteSeconds} opts={[30, 45, 60, 80]} min={10} max={120} unit="s"
            onChange={(v) => setNum("voteSeconds", v)} />
          {isQuestions && (
            <Setting label="Answer rounds" value={room.settings.questionRounds} opts={[1, 2, 3]} unit=""
              onChange={(v) => setNum("questionRounds", v)} />
          )}
          {!isQuestions && (
            <Setting label="Last guess" value={room.settings.guessSeconds} opts={[30, 45, 60, 80]} min={10} max={120} unit="s"
              onChange={(v) => setNum("guessSeconds", v)} />
          )}
          {!isQuestions && (
            <Setting label="Max rounds" value={room.settings.maxRounds} opts={[6, 7, 8, 9, 10]} min={6} max={20} unit=""
              onChange={(v) => setNum("maxRounds", v)} />
          )}
        </section>
      )}

      {me.isHost && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-semibold">Scoring</h2>
          <Setting label="Civilian win" value={room.settings.scoreCivilian} opts={[0, 1, 2, 3]} min={0} max={20} unit=" pt"
            onChange={(v) => setNum("scoreCivilian", v)} />
          <Setting label="Impostor win" value={room.settings.scoreImpostor} opts={[1, 2, 3, 5]} min={0} max={20} unit=" pt"
            onChange={(v) => setNum("scoreImpostor", v)} />
          {!isQuestions && (
            <Setting label="Correct last guess" value={room.settings.scoreGuesser} opts={[2, 3, 4, 5]} min={0} max={20} unit=" pt"
              onChange={(v) => setNum("scoreGuesser", v)} />
          )}
          {!isQuestions && room.settings.jester && (
            <Setting label="Jester win" value={room.settings.scoreJester} opts={[2, 3, 4, 5]} min={0} max={20} unit=" pt"
              onChange={(v) => setNum("scoreJester", v)} />
          )}
        </section>
      )}

      {me.isHost && !isQuestions && (
        <RoleCounts n={n} d={d} c={c} j={j} det={det} auto={room.settings.doppelgangers === "auto"} ok={rolesOk}
          onChange={(patch) => send("room:settings", patch)} />
      )}

      {me.isHost ? (
        <button
          className="btn-primary"
          disabled={!canStart || starting}
          onClick={() => {
            setStarting(true);
            send("game:start");
            // safety: re-enable if the game didn't start (e.g. an error)
            setTimeout(() => setStarting(false), 10000);
          }}
        >
          {starting
            ? room.settings.wordPack === "ai"
              ? "✨ Generating…"
              : "Starting…"
            : n < 4
              ? "Need 4+ players"
              : !rolesOk
                ? "Fix role counts"
                : !customReady
                  ? "Fill in your custom words"
                  : "Start game"}
        </button>
      ) : (
        <p className="text-center text-muted">Waiting for the host to start…</p>
      )}

      {me.isHost && (
        <button
          className="text-center text-sm text-bad hover:underline"
          onClick={() => {
            if (confirm("Close the room for everyone?")) send("room:close");
          }}
        >
          Close room
        </button>
      )}
    </main>
  );
}

/** Mirrors server auto counts (4 players: 1 doppelganger, shown as 1 impostor). */
function resolveCounts(
  n: number,
  s: { doppelgangers: number | "auto"; chameleons: number | "auto" },
): { d: number; c: number } {
  if (s.doppelgangers !== "auto" && s.chameleons !== "auto")
    return { d: s.doppelgangers, c: s.chameleons };
  if (n <= 4) return { d: 1, c: 0 };
  if (n <= 7) return { d: 1, c: 1 };
  if (n <= 9) return { d: 2, c: 1 };
  return { d: 2, c: 2 };
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  tone,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  min?: number;
  max?: number;
  tone: string;
}) {
  const btn = "grid h-9 w-9 place-items-center rounded-lg bg-panel2 text-lg font-bold text-ink disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-sm ${tone}`}>{label}</span>
      <div className="flex items-center gap-2">
        {onChange && (
          <button className={btn} aria-label={`Fewer ${label}`} disabled={value <= (min ?? 0)}
            onClick={() => onChange(value - 1)}>−</button>
        )}
        <span className="w-8 text-center text-lg font-bold tabular-nums">{value}</span>
        {onChange && (
          <button className={btn} aria-label={`More ${label}`} disabled={value >= (max ?? 3)}
            onClick={() => onChange(value + 1)}>+</button>
        )}
      </div>
    </div>
  );
}

function RoleCounts({
  n,
  d,
  c,
  j,
  det,
  auto,
  ok,
  onChange,
}: {
  n: number;
  d: number;
  c: number;
  j: number;
  det: number;
  auto: boolean;
  ok: boolean;
  onChange: (patch: {
    doppelgangers?: number | "auto";
    chameleons?: number | "auto";
    jester?: boolean;
    detective?: boolean;
  }) => void;
}) {
  const civ = Math.max(0, n - d - c - j - det);
  const set = (nd: number, nc: number) => onChange({ doppelgangers: nd, chameleons: nc });
  const tab = (on: boolean) =>
    `min-h-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-brand text-white" : "bg-panel2 text-muted hover:text-ink"}`;
  const toggle = (on: boolean) =>
    `min-h-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? "bg-brand text-white" : "bg-panel2 text-muted hover:text-ink"}`;

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Roles ({n} players)</h2>
        <div className="flex gap-1">
          <button className={tab(auto)} onClick={() => onChange({ doppelgangers: "auto", chameleons: "auto" })}>Auto</button>
          <button className={tab(!auto)} onClick={() => set(d, c)}>Manual</button>
        </div>
      </div>
      <Stepper label="Civilians" value={civ} tone="text-good" />
      <Stepper label="Doppelgangers" value={d} tone="text-brand" max={3}
        onChange={auto ? undefined : (v) => set(v, c)} />
      <Stepper label="Chameleons" value={c} tone="text-warn" max={3}
        onChange={auto ? undefined : (v) => set(d, v)} />

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-warn">🃏 Jester <span className="text-muted">(wins if voted out)</span></span>
        <button className={toggle(j === 1)} onClick={() => onChange({ jester: j === 0 })}>
          {j === 1 ? "On" : "Off"}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-brand">🔍 Detective <span className="text-muted">(one peek)</span></span>
        <button className={toggle(det === 1)} onClick={() => onChange({ detective: det === 0 })}>
          {det === 1 ? "On" : "Off"}
        </button>
      </div>

      <p className={`text-xs ${ok ? "text-muted" : "text-bad"}`}>
        {ok
          ? "Civilians = players minus impostors and special roles. Civilians must outnumber impostors."
          : "Need at least 1 impostor, at least 1 plain civilian, and civilians must outnumber impostors."}
      </p>
    </section>
  );
}

/** Preset buttons plus an optional custom-value button (when min/max given). */
function Setting({
  label,
  value,
  opts,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  opts: number[];
  min?: number;
  max?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const custom = min !== undefined && max !== undefined;
  const isCustomValue = custom && !opts.includes(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function commit() {
    setEditing(false);
    const n = Math.round(Number(draft));
    if (draft.trim() === "" || Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max!, Math.max(min!, n));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  const btn = "min-h-0 rounded-lg px-3 py-1.5 text-sm font-medium transition";
  const on = "bg-brand text-white";
  const off = "bg-panel2 text-muted hover:text-ink";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-1">
        {opts.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={`${btn} ${value === o ? on : off}`}>
            {o === 0 && unit === "s" ? "off" : `${o}${unit}`}
          </button>
        ))}
        {custom &&
          (editing ? (
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label={`${label} custom, ${min} to ${max}`}
              className="w-16 rounded-lg border border-brand bg-panel2 px-2 py-1.5 text-center text-sm outline-none"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              title={`Custom (${min}-${max})`}
              aria-label={`${label}: custom value`}
              className={`${btn} ${isCustomValue ? on : off}`}
            >
              {isCustomValue ? `${value}${unit}` : "✎"}
            </button>
          ))}
      </div>
    </div>
  );
}

function Leaderboard({ view }: { view: ScreenProps["view"] }) {
  const { room } = view;
  const ranked = [...room.players]
    .map((p) => ({ p, score: room.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <section className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold">Leaderboard</h2>
        <span className="text-xs text-muted">{room.gamesPlayed} game{room.gamesPlayed === 1 ? "" : "s"}</span>
      </div>
      {ranked.map((r, i) => (
        <div key={r.p.id} className="flex items-center gap-3">
          <span className="w-6 text-center">{medal[i] ?? `${i + 1}.`}</span>
          <Avatar name={r.p.name} seed={r.p.id} />
          <span className="flex-1 truncate font-medium">{r.p.name}</span>
          <span className="font-display font-bold text-brand">{r.score}</span>
        </div>
      ))}
    </section>
  );
}

function CustomWordForm({ view, send }: ScreenProps) {
  const cw = view.room.settings.customWord;
  const [civ, setCiv] = useState(cw?.civilian ?? "");
  const [dop, setDop] = useState(cw?.doppelganger ?? "");

  function save() {
    const civilian = civ.trim();
    const doppelganger = dop.trim();
    if (!civilian || !doppelganger) return;
    send("room:settings", { customWord: { civilian, doppelganger } });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">Your own pair. Civilians get the first word, the impostor gets the second.</p>
      <input className="input !min-h-[44px]" maxLength={30} placeholder="Civilians' word"
        value={civ} onChange={(e) => setCiv(e.target.value)} onBlur={save} />
      <input className="input !min-h-[44px]" maxLength={30} placeholder="Doppelganger's word"
        value={dop} onChange={(e) => setDop(e.target.value)} onBlur={save} />
    </div>
  );
}

function CustomQuestionForm({ view, send }: ScreenProps) {
  const cq = view.room.settings.customQuestion;
  const [civ, setCiv] = useState(cq?.civilian ?? "");
  const [imp, setImp] = useState(cq?.imposter ?? "");

  function save() {
    const civilian = civ.trim();
    const imposter = imp.trim();
    if (!civilian || !imposter) return;
    send("room:settings", { wordPack: "custom", customQuestion: { civilian, imposter } });
  }

  return (
    <section className="card flex flex-col gap-2">
      <h2 className="font-display font-semibold">Custom question</h2>
      <p className="text-xs text-muted">Everyone gets the first question; the imposter gets the second.</p>
      <input className="input !min-h-[44px]" maxLength={80} placeholder="Everyone's question"
        value={civ} onChange={(e) => setCiv(e.target.value)} onBlur={save} />
      <input className="input !min-h-[44px]" maxLength={80} placeholder="Imposter's question"
        value={imp} onChange={(e) => setImp(e.target.value)} onBlur={save} />
    </section>
  );
}
