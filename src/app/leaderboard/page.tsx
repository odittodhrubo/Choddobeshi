"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase, supabaseEnabled } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui";

interface Row {
  user_id: string;
  username: string | null;
  points: number;
  wins: number;
  games: number;
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const sb = supabase();
      if (!sb) {
        setError("Leaderboard is not configured yet.");
        setRows([]);
        return;
      }
      const { data, error } = await sb
        .from("leaderboard")
        .select("user_id,username,points,wins,games");
      if (error) {
        setError("Leaderboard will appear once games have been played.");
        setRows([]);
      } else {
        setRows((data as Row[]) ?? []);
      }
    })();
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
        <Link href="/" className="text-sm text-brand hover:underline">
          ← Back
        </Link>
      </header>

      {!supabaseEnabled && (
        <p className="text-sm text-muted">Sign-in is not set up, so there is no global leaderboard.</p>
      )}

      {rows === null ? (
        <p className="text-center text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-muted">{error || "No scores yet — play a game!"}</p>
      ) : (
        <section className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={r.user_id} className="flex items-center gap-3 rounded-xl border border-line bg-panel2/50 px-3 py-2">
              <span className="w-7 text-center font-display font-bold">
                {["🥇", "🥈", "🥉"][i] ?? i + 1}
              </span>
              <Avatar name={r.username ?? "??"} seed={r.user_id} />
              <span className="flex-1 truncate font-medium">{r.username ?? "Guest"}</span>
              <span className="text-xs text-muted">{r.wins}W / {r.games}</span>
              <span className="w-12 text-right font-display font-bold text-brand">{r.points}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
