import type { Server } from "socket.io";
import type { PlayerView, PublicPlayer, Room } from "../../shared/types";
import { countVotes } from "./votes";
import { saveRoom } from "../persistence";

export function viewFor(room: Room, playerId: string): PlayerView {
  const me = room.players.find((p) => p.id === playerId)!;
  const over = room.phase === "GAME_OVER";
  const revealAll = over;

  const players: PublicPlayer[] = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    connected: p.connected,
    alive: p.alive,
    revealedRole:
      revealAll || (!p.alive && room.settings.revealRoleOnEject) ? p.role : undefined,
    hasVoted: room.phase === "VOTING" ? p.id in room.votes : undefined,
    hasAnswered: room.phase === "ANSWER" ? p.id in room.answers : undefined,
    ready: room.phase === "ROLE_REVEAL" ? room.ready.includes(p.id) : undefined,
    muted: room.muted.includes(p.id) || undefined,
    frame: p.frame,
    color: p.color,
  }));

  // Jester and Detective are told their role. Impostor roles never are:
  // the Doppelganger must not learn it, and the Chameleon already knows.
  const specialRole =
    me.role === "jester" || me.role === "detective" ? me.role : undefined;

  const lastVote = room.voteLog[room.voteLog.length - 1];

  return {
    me: {
      id: me.id,
      word: me.word ?? null,
      isChameleon: me.role === "chameleon",
      specialRole,
      alive: me.alive,
      isHost: me.isHost,
      myVote: room.phase === "VOTING" ? room.votes[me.id] : undefined,
      peek: room.peeks[me.id],
    },
    room: {
      code: room.code,
      phase: room.phase,
      phaseEndsAt: room.phaseEndsAt,
      round: room.round,
      settings: room.settings,
      turnOrder: room.turnOrder,
      turnIndex: room.turnIndex,
      clues: room.clues,
      mode: room.settings.mode,
      // Finished answer rounds only: an in-progress round stays hidden.
      answerRounds: room.answerHistory.length ? room.answerHistory : undefined,
      players,
      lastEliminated: room.lastEliminated,
      guesserId: room.guesserId,
      winner: room.winner,
      scores: room.scores,
      gamesPlayed: room.gamesPlayed,
      emergencyUsedBy: room.emergencyUsedBy,
      voteLog: over ? room.voteLog : undefined,
      lastVotes: room.phase === "VOTE_RESULT" ? lastVote?.votes : undefined,
      voteTally: room.phase === "VOTE_RESULT" ? countVotes(room) : undefined,
      ...(over && {
        civilianWord: room.civilianWord,
        doppelgangerWord: room.doppelgangerWord,
      }),
    },
  };
}

export function broadcast(io: Server, room: Room): void {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit("state", viewFor(room, p.id));
  }
  saveRoom(room); // debounced snapshot for restart-survival
}
