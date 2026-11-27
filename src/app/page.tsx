"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { socket, getName, setName, getPlayerId, setSocketToken } from "@/lib/socket";
import { supabaseEnabled } from "@/lib/supabase/client";
import {
  ensureSession,
  accessToken,
  getUsername,
  saveUsername,
  getMyStats,
  getMyAchievements,
  isGuest,
  signInWithGoogle,
  type Stats,
} from "@/lib/supabase/auth";
import { ACHIEVEMENTS, FRAMES, AVATAR_COLORS, featuredPack, WORD_PACKS, levelFor } from "@/shared/types";
import { getMyProfile, saveCosmetics } from "@/lib/supabase/auth";
import { Avatar, PlayerStyles } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [name, setNameState] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [guest, setGuest] = useState(true);
  const [frame, setFrame] = useState<string>("none");
  const [color, setColor] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [myId, setMyId] = useState("me");

  useEffect(() => {
    setNameState(getName());
    if (new URLSearchParams(location.search).get("kicked") === "1") {
      setError("You were removed from the room.");
      history.replaceState(null, "", "/");
    }
    // Guest session + token, then load profile/stats (all optional).
    void (async () => {
      if (!supabaseEnabled) return;
      await ensureSession();
      setSocketToken(await accessToken());
      const uname = await getUsername();
      if (uname && !getName()) {
        setName(uname);
        setNameState(uname);
      }
      setGuest(await isGuest());
      setStats(await getMyStats());
      setBadges(await getMyAchievements());
      const prof = await getMyProfile();
      if (prof) {
        setFrame(prof.frame ?? "none");
        setColor(prof.color);
        setFriendCode(prof.friend_code);
      }
      setMyId(getPlayerId());
    })();
  }, []);

  function saveName(): boolean {
    const n = name.trim();
    if (n.length < 1) {
      setError("Enter a name first");
      return false;
    }
    setName(n);
    setError("");
    if (supabaseEnabled) void saveUsername(n);
    return true;
  }

  function createRoom() {
    if (!saveName() || busy) return;
    setBusy(true);
    const onCreated = ({ code }: { code: string }) => {
      socket.off("room:created", onCreated);
      socket.off("error", onErr);
      router.push(`/room/${code}`);
    };
    const onErr = (e: { message: string }) => {
      socket.off("room:created", onCreated);
      socket.off("error", onErr);
      setBusy(false);
      setError(e.message);
    };
    socket.on("room:created", onCreated);
    socket.on("error", onErr);
    if (!socket.connected) socket.connect();
    socket.emit("room:create", { name: name.trim(), playerId: getPlayerId() });
  }

  function joinRoom() {
    if (!saveName()) return;
    const c = code.trim().toUpperCase();
    if (c.length !== 4) {
      setError("Room codes are 4 letters");
      return;
    }
    router.push(`/room/${c}`);
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-6">
      <header className="text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight">Choddobeshi</h1>
        <p className="mt-2 text-muted">
          Spot the <span className="text-brand">Doppelganger</span> and the{" "}
          <span className="text-warn">Chameleon</span>.
        </p>
      </header>

      <p className="text-center text-sm text-muted">
        ⭐ Today&apos;s daily pack:{" "}
        <b className="text-warn">{WORD_PACKS.find((w) => w.id === featuredPack())?.name}</b>
        <span> — winners earn +1 point</span>
      </p>

      <div className="card flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Your name</span>
          <input
            className="input"
            value={name}
            maxLength={16}
            placeholder="e.g. Rafi"
            onChange={(e) => setNameState(e.target.value)}
          />
        </label>

        <button className="btn-primary" onClick={createRoom} disabled={busy}>
          {busy ? "Creating…" : "Create a room"}
        </button>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          OR JOIN
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="flex gap-2">
          <input
            className="input uppercase tracking-widest"
            value={code}
            maxLength={4}
            placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
          />
          <button className="btn-ghost shrink-0" onClick={joinRoom}>
            Join
          </button>
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}
      </div>

      {supabaseEnabled && (stats || guest) && (
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold">Your profile</h2>
            {guest && <span className="chip bg-warn/20 text-warn">guest</span>}
          </div>

          {stats && stats.games > 0 ? (
            <>
              <div className="flex items-center justify-between rounded-xl border border-line bg-panel2/50 px-4 py-2.5">
                <span className="font-display font-bold text-brand">Level {levelFor(stats.points)}</span>
                <span className="text-xs text-muted">{stats.points} XP</span>
              </div>
              {stats.streak_days > 0 && (
                <p className="text-center text-sm">
                  🔥 <b>{stats.streak_days}-day streak</b>
                  <span className="text-muted"> · best {stats.best_streak}</span>
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Games" value={stats.games} />
                <Stat label="Wins" value={stats.wins} />
                <Stat label="Win rate" value={`${Math.round((stats.wins / stats.games) * 100)}%`} />
                <Stat
                  label="Civilian W%"
                  value={stats.times_civilian ? `${Math.round((stats.civ_wins / stats.times_civilian) * 100)}%` : "—"}
                />
                <Stat
                  label="Impostor W%"
                  value={stats.times_impostor ? `${Math.round((stats.imp_wins / stats.times_impostor) * 100)}%` : "—"}
                />
                <Stat label="Guesses" value={stats.guesser_wins} />
              </div>
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {ACHIEVEMENTS.filter((a) => badges.includes(a.id)).map((a) => (
                    <span key={a.id} title={a.desc} className="chip bg-panel2 text-ink">
                      {a.icon} {a.label}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Play a game to start tracking your stats.</p>
          )}

          {stats && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2/40 p-3">
              <div className="flex items-center gap-3">
                <PlayerStyles
                  players={[
                    { id: myId, name: name || "You", isHost: false, connected: true, alive: true, frame, color: color ?? undefined },
                  ]}
                >
                  <Avatar name={name || "You"} seed={myId} size={44} />
                </PlayerStyles>
                <p className="text-sm text-muted">Customise your avatar. Unlock more by levelling up.</p>
              </div>
              <p className="text-xs uppercase tracking-wide text-muted">Frame</p>
              <div className="flex flex-wrap gap-1.5">
                {FRAMES.map((f) => {
                  const locked = levelFor(stats.points) < f.minLevel;
                  return (
                    <button
                      key={f.id}
                      disabled={locked}
                      onClick={() => {
                        setFrame(f.id);
                        void saveCosmetics(f.id, color);
                      }}
                      className={`min-h-0 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        frame === f.id ? "border-brand bg-brand/20" : "border-line bg-panel2"
                      } ${locked ? "opacity-40" : ""}`}
                      title={locked ? `Unlocks at level ${f.minLevel}` : f.label}
                    >
                      {f.label}
                      {locked ? ` 🔒${f.minLevel}` : ""}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs uppercase tracking-wide text-muted">Colour</p>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((c) => {
                  const locked = levelFor(stats.points) < c.minLevel;
                  return (
                    <button
                      key={c.id}
                      disabled={locked}
                      onClick={() => {
                        setColor(c.id);
                        void saveCosmetics(frame, c.id);
                      }}
                      aria-label={`Colour ${c.id}${locked ? ` (unlocks at level ${c.minLevel})` : ""}`}
                      className={`h-7 w-7 rounded-full border-2 ${color === c.id ? "border-white" : "border-transparent"} ${locked ? "opacity-30" : ""}`}
                      style={{ background: c.id }}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-muted">Cosmetics show to other players when you are signed in.</p>
            </div>
          )}

          {friendCode && (
            <p className="text-center text-sm text-muted">
              Friend code: <b className="tracking-widest text-ink">{friendCode}</b>
            </p>
          )}

          {guest && (
            <button className="btn-ghost" onClick={() => void signInWithGoogle()}>
              Sign in with Google to save progress
            </button>
          )}
        </div>
      )}

      <div className="flex justify-center gap-5 text-sm">
        <Link href="/how-to-play" className="text-brand hover:underline">
          How to play →
        </Link>
        {supabaseEnabled && (
          <Link href="/leaderboard" className="text-brand hover:underline">
            Leaderboard →
          </Link>
        )}
        {supabaseEnabled && (
          <Link href="/friends" className="text-brand hover:underline">
            Friends →
          </Link>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/50 px-2 py-2">
      <div className="font-display text-xl font-bold text-brand">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
