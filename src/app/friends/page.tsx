"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseEnabled } from "@/lib/supabase/client";
import {
  ensureSession,
  getMyProfile,
  listFriends,
  addFriendByCode,
  removeFriend,
  type Friend,
} from "@/lib/supabase/auth";
import { Avatar } from "@/components/ui";

export default function FriendsPage() {
  const [code, setCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseEnabled) {
      setFriends([]);
      return;
    }
    await ensureSession();
    setCode((await getMyProfile())?.friend_code ?? null);
    setFriends(await listFriends());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    const c = input.trim();
    if (!c) return;
    const r = await addFriendByCode(c);
    setMsg(
      r === "ok"
        ? "Friend added!"
        : r === "not_found"
          ? "No player has that code."
          : r === "self"
            ? "That is your own code."
            : "Could not add friend. Try again.",
    );
    if (r === "ok") {
      setInput("");
      setFriends(await listFriends());
    }
  }

  function copy() {
    if (!code) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <main className="flex flex-1 flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Friends</h1>
        <Link href="/" className="text-sm text-brand hover:underline">
          ← Back
        </Link>
      </header>

      {!supabaseEnabled ? (
        <p className="text-sm text-muted">Accounts are not set up, so friends are unavailable.</p>
      ) : (
        <>
          <section className="card flex flex-col gap-2 text-center">
            <p className="text-sm text-muted">Your friend code</p>
            <button
              onClick={copy}
              className="font-display text-4xl font-bold tracking-[0.25em] text-brand"
              aria-label="Copy friend code"
            >
              {code ?? "······"}
            </button>
            <p className="text-xs text-muted">{copied ? "Copied!" : "Tap to copy and send it to a friend."}</p>
          </section>

          <section className="card flex flex-col gap-2">
            <h2 className="font-display font-semibold">Add a friend</h2>
            <div className="flex gap-2">
              <input
                className="input uppercase tracking-widest"
                value={input}
                maxLength={8}
                placeholder="FRIEND CODE"
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && void add()}
              />
              <button className="btn-primary shrink-0" onClick={() => void add()}>
                Add
              </button>
            </div>
            {msg && <p className="text-sm text-muted">{msg}</p>}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Your friends</h2>
            {friends === null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : friends.length === 0 ? (
              <p className="text-sm text-muted">No friends yet. Share your code!</p>
            ) : (
              friends.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel2/50 px-3 py-2">
                  <Avatar name={f.username ?? "??"} seed={f.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.username ?? "Guest"}</p>
                    <p className="text-xs text-muted">
                      {f.wins}W / {f.games} games
                    </p>
                  </div>
                  <span className="font-display font-bold text-brand">{f.points}</span>
                  <button
                    onClick={async () => {
                      if (confirm(`Remove ${f.username ?? "this friend"}?`)) {
                        await removeFriend(f.id);
                        setFriends(await listFriends());
                      }
                    }}
                    className="text-xs text-muted hover:text-bad"
                    aria-label="Remove friend"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </section>

          <p className="text-center text-xs text-muted">
            To play together, create a room and share the room link or QR code from the lobby.
          </p>
        </>
      )}
    </main>
  );
}
