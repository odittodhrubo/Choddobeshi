"use client";

import type { ChatScreenProps } from "@/components/types";
import {
  Timer,
  WordBadge,
  Avatar,
  ReactionBar,
  MeetingButton,
  DetectivePanel,
  HostTools,
} from "@/components/ui";
import ChatBox from "@/components/ChatBox";

export default function Discussion({ view, send, chat }: ChatScreenProps) {
  const { me, room } = view;
  const byId = (id: string) => room.players.find((p) => p.id === id);
  const isQuestions = room.mode === "questions";

  const clueRounds = Array.from({ length: room.round }, (_, i) => i + 1);
  const answerRounds = room.answerRounds ?? [];

  return (
    <main className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold">Discussion</h2>
        <Timer endsAt={room.phaseEndsAt} />
      </div>

      {isQuestions ? (
        <>
          <div className="flex w-full items-center justify-between rounded-xl border border-line bg-panel2/70 px-4 py-2.5">
            <span className="text-xs uppercase tracking-wide text-muted">Your question</span>
            <span className="truncate pl-3 text-right text-sm font-semibold text-brand">{me.word}</span>
          </div>
          <section className="flex-1 space-y-3 overflow-y-auto">
            {answerRounds.map((r, i) => (
              <div key={i}>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted">Round {i + 1} answers</p>
                <div className="space-y-1">
                  {room.players
                    .filter((p) => p.alive || r[p.id])
                    .map((p) => (
                      <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel2/50 px-3 py-1.5">
                        <Avatar name={p.name} seed={p.id} />
                        <span className="w-20 shrink-0 truncate text-sm text-muted">{p.name}</span>
                        <span className="flex-1 truncate font-semibold">{r[p.id] ?? "—"}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <>
          <WordBadge word={me.word} isChameleon={me.isChameleon} specialRole={me.specialRole} />
          <DetectivePanel view={view} send={send} />

          <section className="flex-1 space-y-3 overflow-y-auto">
            {clueRounds.map((r) => (
              <div key={r}>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted">Round {r}</p>
                <div className="space-y-1">
                  {room.clues
                    .filter((c) => c.round === r)
                    .map((c, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg bg-panel2/40 px-3 py-1.5">
                        <Avatar name={byId(c.playerId)?.name ?? "?"} seed={c.playerId} />
                        <span className="flex-1 truncate text-sm text-muted">
                          {byId(c.playerId)?.name}
                        </span>
                        <span className="font-semibold">{c.text}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      <ReactionBar send={send} />

      <ChatBox chat={chat} send={send} ghost={!me.alive} />

      {!isQuestions && me.alive && (
        <MeetingButton used={room.emergencyUsedBy.includes(me.id)} send={send} />
      )}

      <HostTools view={view} send={send} />

      {me.isHost && (
        <button className="btn-ghost" onClick={() => send("discussion:skip")}>
          Skip to voting →
        </button>
      )}
    </main>
  );
}
