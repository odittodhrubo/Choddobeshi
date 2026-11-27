"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseEnabled } from "@/lib/supabase/client";
import { ensureSession, getBoard, getFriendsBoard, type BoardRow } from "@/lib/supabase/auth";
import { Avatar } from "@/components/ui";

type Tab = "all" | "week" | "friends";

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("week");
  const [rows, setRows] = useState<BoardRow[] | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    void (async () => {
      if (!supabaseEnabled) {
        if (live) setRows([]);
        return;
      }
      await ensureSession();
      const data =
        tab === "friends" ? await getFriendsBoard() : await getBoard(tab === "week" ? "week" : "all");
      if (live) setRows(data);
    })();
    return () => {
      live = false;
    };
  }, [tab]);

  const tabs: [Tab, string][] = [
    ["week", "This week"],
    ["all", "All time"],
    ["friends", "Friends"],
  ];

  return (
    <main className="flex flex-1 flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
        <Link href="/" className="text-sm text-brand hover:underline">
          ← Back
        </Link>
      </header>

      <div className="grid grid-cols-3 gap-1.5">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`min-h-0 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition ${
              tab === id ? "border-brand bg-brand/20 text-white" : "border-line bg-panel2 text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!supabaseEnabled && (
        <p className="text-sm text-muted">Sign-in is not set up, so there is no global leaderboard.</p>
      )}

      {rows === null ? (
        <p className="text-center text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-muted">
          {tab === "friends" ? "Add friends to compare scores." : "No scores yet — play a game!"}
        </p>
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
