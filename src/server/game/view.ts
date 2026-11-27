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
  }));

  // Answers are shown to everyone from DISCUSSION onward, hidden during ANSWER.
  const answersVisible = ["DISCUSSION", "VOTING", "VOTE_RESULT", "LAST_GUESS", "GAME_OVER"].includes(
    room.phase,
  );

  return {
    me: {
      id: me.id,
      word: me.word ?? null,
      isChameleon: me.role === "chameleon",
      alive: me.alive,
      isHost: me.isHost,
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
      answers: answersVisible ? room.answers : undefined,
      players,
      lastEliminated: room.lastEliminated,
      guesserId: room.guesserId,
      winner: room.winner,
      scores: room.scores,
      gamesPlayed: room.gamesPlayed,
      emergencyUsedBy: room.emergencyUsedBy,
      voteLog: over ? room.voteLog : undefined,
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
