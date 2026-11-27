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
import { ACHIEVEMENTS } from "@/shared/types";

export default function Home() {
  const router = useRouter();
  const [name, setNameState] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [guest, setGuest] = useState(true);

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
                <span className="font-display font-bold text-brand">Level {level(stats.points)}</span>
                <span className="text-xs text-muted">{stats.points} XP</span>
              </div>
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
      </div>
    </main>
  );
}

// Level curve: each level needs a bit more XP than the last.
function level(points: number): number {
  return Math.floor(0.5 + Math.sqrt(Math.max(0, points) / 10)) + 1;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/50 px-2 py-2">
      <div className="font-display text-xl font-bold text-brand">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
