"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { socket, getName, getPlayerId, setSocketToken } from "@/lib/socket";
import { ensureSession, accessToken } from "@/lib/supabase/auth";
import { play } from "@/lib/sfx";
import type { ChatMsg, PlayerView } from "@/shared/types";
import Lobby from "@/components/screens/Lobby";
import RoleReveal from "@/components/screens/RoleReveal";
import Clue from "@/components/screens/Clue";
import Answer from "@/components/screens/Answer";
import Discussion from "@/components/screens/Discussion";
import Voting from "@/components/screens/Voting";
import Ejection from "@/components/screens/Ejection";
import LastGuess from "@/components/screens/LastGuess";
import GameOver from "@/components/screens/GameOver";

export type Send = (event: string, payload?: unknown) => void;

interface FloatReaction {
  id: number;
  from: string;
  emoji: string;
  left: number;
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [view, setView] = useState<PlayerView | null>(null);
  const [toast, setToast] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [online, setOnline] = useState(true);
  const [reactions, setReactions] = useState<FloatReaction[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reactId = useRef(0);
  const prev = useRef<{ phase: string; myTurn: boolean }>({ phase: "", myTurn: false });

  useEffect(() => {
    const name = getName();
    if (!name) {
      router.replace("/");
      return;
    }
    const playerId = getPlayerId();

    const onState = (v: PlayerView) => setView(v);
    const onError = (e: { message: string }) => {
      setToast(e.message);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 2500);
    };
    const onChat = (m: ChatMsg) => setChat((c) => [...c.slice(-50), m]);
    const onReaction = (r: { from: string; emoji: string }) => {
      const id = ++reactId.current;
      setReactions((list) => [...list, { id, from: r.from, emoji: r.emoji, left: 10 + Math.random() * 80 }]);
      play("react");
      setTimeout(() => setReactions((list) => list.filter((x) => x.id !== id)), 2200);
    };
    const onKicked = () => {
      socket.disconnect();
      router.replace("/?kicked=1");
    };
    const onClosed = () => {
      socket.disconnect();
      router.replace("/");
    };
    const onConnect = () => {
      setOnline(true);
      socket.emit("room:join", { code: code.toUpperCase(), name, playerId });
    };
    const onDisconnect = () => setOnline(false);

    socket.on("state", onState);
    socket.on("error", onError);
    socket.on("chat", onChat);
    socket.on("reaction", onReaction);
    socket.on("kicked", onKicked);
    socket.on("closed", onClosed);
    socket.on("connect", onConnect); // fires on first connect AND every reconnect
    socket.on("disconnect", onDisconnect);

    // Attach the Supabase guest token (if any) before connecting, so the
    // server can attribute stats. Falls through to a guest game if unavailable.
    void (async () => {
      await ensureSession();
      setSocketToken(await accessToken());
      if (socket.connected) onConnect();
      else socket.connect();
    })();

    return () => {
      socket.off("state", onState);
      socket.off("error", onError);
      socket.off("chat", onChat);
      socket.off("reaction", onReaction);
      socket.off("kicked", onKicked);
      socket.off("closed", onClosed);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [code, router]);

  // Sound cues on phase / turn changes.
  useEffect(() => {
    if (!view) return;
    const { me, room } = view;
    const myTurn = room.phase === "CLUES" && room.turnOrder[room.turnIndex] === me.id && me.alive;
    const p = prev.current;
    if (room.phase !== p.phase) {
      if (room.phase === "VOTING") play("vote");
      else if (room.phase === "VOTE_RESULT") play("eject");
      else if (room.phase === "GAME_OVER")
        play(room.winner?.playerIds.includes(me.id) ? "win" : "lose");
    }
    if (myTurn && !p.myTurn) play("turn");
    prev.current = { phase: room.phase, myTurn };
  }, [view]);

  const send: Send = (event, payload) => socket.emit(event, payload ?? {});

  if (!view) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        Connecting to room {code.toUpperCase()}…
      </div>
    );
  }

  const phase = view.room.phase;
  const common = { view, send };

  return (
    <div className="flex flex-1 flex-col">
      {phase === "LOBBY" && <Lobby {...common} />}
      {phase === "ROLE_REVEAL" && <RoleReveal {...common} />}
      {phase === "CLUES" && <Clue {...common} />}
      {phase === "ANSWER" && <Answer {...common} />}
      {phase === "DISCUSSION" && <Discussion {...common} chat={chat} />}
      {phase === "VOTING" && <Voting {...common} chat={chat} />}
      {phase === "VOTE_RESULT" && <Ejection {...common} />}
      {phase === "LAST_GUESS" && <LastGuess {...common} />}
      {phase === "GAME_OVER" && <GameOver {...common} />}

      {/* Floating emoji reactions */}
      <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="absolute bottom-24 text-3xl"
            style={{ left: `${r.left}%`, animation: "reactfloat 2.2s ease-out forwards" }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {!online && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center">
          <div className="mt-2 rounded-full border border-warn/50 bg-warn/20 px-4 py-1.5 text-sm text-warn">
            Reconnecting…
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-4">
          <div className="rounded-xl border border-bad/50 bg-bad/20 px-4 py-2 text-sm text-bad shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
