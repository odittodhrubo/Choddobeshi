"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { socket, getName, setName, getPlayerId } from "@/lib/socket";

export default function Home() {
  const router = useRouter();
  const [name, setNameState] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNameState(getName());
    if (new URLSearchParams(location.search).get("kicked") === "1") {
      setError("You were removed from the room.");
      history.replaceState(null, "", "/");
    }
  }, []);

  function saveName(): boolean {
    const n = name.trim();
    if (n.length < 1) {
      setError("Enter a name first");
      return false;
    }
    setName(n);
    setError("");
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

      <Link href="/how-to-play" className="text-center text-sm text-brand hover:underline">
        How to play →
      </Link>
    </main>
  );
}
