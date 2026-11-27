import type { Server } from "socket.io";
import type { Player, Room, Winner } from "../../shared/types";
import { assignRoles, assignQuestionRoles, makeTurnOrder } from "./roles";
import { tallyVotes, checkWinner, countVotes } from "./votes";
import { isCorrectGuess, normalize } from "./guess";
import { pickPair } from "../words";
import { pickQuestion } from "../questions";
import { broadcast } from "./view";

const REVEAL_SECONDS = 8;
const RESULT_SECONDS = 6;

function clearTimer(room: Room): void {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = undefined;
  }
}

/** Set phase, deadline and a single server timer, then broadcast. */
function enter(
  io: Server,
  room: Room,
  phase: Room["phase"],
  seconds: number | null,
  next?: () => void,
): void {
  clearTimer(room);
  room.phase = phase;
  room.phaseEndsAt = seconds != null ? Date.now() + seconds * 1000 : null;
  if (seconds != null && next) {
    room.timer = setTimeout(next, seconds * 1000);
  }
  broadcast(io, room);
}

function alivePlayers(room: Room): Player[] {
  return room.players.filter((p) => p.alive);
}

// ---- Game start ----------------------------------------------------------

export function startGame(io: Server, room: Room): string | null {
  if (room.phase !== "LOBBY") return "Game already started";
  if (room.players.length < 4) return "Need at least 4 players";

  const questions = room.settings.mode === "questions";
  const custom = room.settings.wordPack === "custom";
  try {
    if (questions) {
      if (custom && room.settings.customQuestion) {
        assignQuestionRoles(room, room.settings.customQuestion);
      } else {
        const { pair, index } = pickQuestion(room.usedPairs);
        room.usedPairs.push(index);
        assignQuestionRoles(room, pair);
      }
    } else if (custom && room.settings.customWord) {
      assignRoles(room, { ...room.settings.customWord, aliases: [] });
    } else {
      const { pair, index } = pickPair(room.settings.wordPack, room.usedPairs, room.settings.difficulty);
      room.usedPairs.push(index);
      assignRoles(room, pair);
    }
  } catch (e) {
    return (e as Error).message;
  }

  room.round = 0;
  room.clues = [];
  room.answers = {};
  room.votes = {};
  room.winner = null;
  room.lastEliminated = null;
  room.guesserId = null;
  room.emergencyUsedBy = [];
  room.voteLog = [];

  const afterReveal = questions ? () => startAnswer(io, room) : () => startRound(io, room);
  enter(io, room, "ROLE_REVEAL", REVEAL_SECONDS, afterReveal);
  return null;
}

// ---- Answer phase (questions mode) --------------------------------------

function startAnswer(io: Server, room: Room): void {
  room.round = 1;
  room.answers = {};
  room.votes = {};
  enter(io, room, "ANSWER", room.settings.clueSeconds, () => toDiscussion(io, room));
}

export function submitAnswer(
  io: Server,
  room: Room,
  playerId: string,
  text: string,
): string | null {
  if (room.phase !== "ANSWER") return "Not the answer phase";
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !player.alive) return "You cannot answer";
  room.answers[playerId] = text.trim();

  if (alivePlayers(room).every((p) => p.id in room.answers)) {
    toDiscussion(io, room);
  } else {
    broadcast(io, room);
  }
  return null;
}

// ---- Clue phase ----------------------------------------------------------

export function startRound(io: Server, room: Room): void {
  room.round += 1;
  room.turnOrder = makeTurnOrder(room);
  room.turnIndex = 0;
  room.votes = {};
  room.lastEliminated = null;
  room.guesserId = null;
  beginClueTurn(io, room);
}

function currentSpeakerId(room: Room): string | undefined {
  return room.turnOrder[room.turnIndex];
}

function beginClueTurn(io: Server, room: Room): void {
  const speakerId = currentSpeakerId(room);
  if (!speakerId) {
    toDiscussion(io, room);
    return;
  }
  const speaker = room.players.find((p) => p.id === speakerId);
  // Skip a disconnected speaker automatically.
  if (speaker && !speaker.connected) {
    room.clues.push({ playerId: speakerId, round: room.round, text: "—" });
    room.turnIndex += 1;
    beginClueTurn(io, room);
    return;
  }
  enter(io, room, "CLUES", room.settings.clueSeconds, () => onClueTimeout(io, room));
}

function onClueTimeout(io: Server, room: Room): void {
  const speakerId = currentSpeakerId(room);
  if (speakerId) {
    room.clues.push({ playerId: speakerId, round: room.round, text: "—" });
  }
  room.turnIndex += 1;
  beginClueTurn(io, room);
}

export function validateClue(room: Room, player: Player, raw: string): string | null {
  const text = normalize(raw);
  if (!text) return "Clue cannot be empty";
  if (text.split(" ").length > 1) return "One word only";
  if (room.clues.some((c) => normalize(c.text) === text)) return "That word was already used";
  // Only guard against the player's OWN word, never the other word (would leak).
  if (player.word) {
    const own = normalize(player.word);
    if (text === own || text.includes(own) || own.includes(text))
      return "You cannot say your own word";
  }
  return null;
}

export function submitClue(
  io: Server,
  room: Room,
  playerId: string,
  text: string,
): string | null {
  if (room.phase !== "CLUES") return "Not the clue phase";
  if (currentSpeakerId(room) !== playerId) return "It is not your turn";
  const player = room.players.find((p) => p.id === playerId)!;
  const err = validateClue(room, player, text);
  if (err) return err;

  room.clues.push({ playerId, round: room.round, text: text.trim() });
  room.turnIndex += 1;
  beginClueTurn(io, room);
  return null;
}

// ---- Discussion ----------------------------------------------------------

function toDiscussion(io: Server, room: Room): void {
  if (room.settings.discussionSeconds <= 0) {
    startVoting(io, room);
    return;
  }
  enter(io, room, "DISCUSSION", room.settings.discussionSeconds, () => startVoting(io, room));
}

export function skipDiscussion(io: Server, room: Room, byHost: boolean): string | null {
  if (room.phase !== "DISCUSSION") return "Not in discussion";
  if (!byHost) return "Only the host can skip";
  startVoting(io, room);
  return null;
}

// ---- Voting --------------------------------------------------------------

function startVoting(io: Server, room: Room): void {
  room.votes = {};
  enter(io, room, "VOTING", room.settings.voteSeconds, () => doTally(io, room));
}

export function castVote(
  io: Server,
  room: Room,
  voterId: string,
  target: string,
): string | null {
  if (room.phase !== "VOTING") return "Not the voting phase";
  const voter = room.players.find((p) => p.id === voterId);
  if (!voter || !voter.alive) return "Only living players can vote";
  if (target !== "skip" && !room.players.some((p) => p.id === target && p.alive))
    return "Invalid vote target";

  room.votes[voterId] = target as string | "skip";

  // If every living player has voted, resolve immediately.
  if (alivePlayers(room).every((p) => p.id in room.votes)) {
    doTally(io, room);
  } else {
    broadcast(io, room);
  }
  return null;
}

function doTally(io: Server, room: Room): void {
  const eliminatedId = tallyVotes(room);
  room.lastEliminated = eliminatedId;
  room.voteLog.push({ round: room.round, tally: countVotes(room), eliminatedId });
  if (eliminatedId) {
    const p = room.players.find((x) => x.id === eliminatedId);
    if (p) p.alive = false;
  }
  enter(io, room, "VOTE_RESULT", RESULT_SECONDS, () => resolveAfterVote(io, room));
}

/** Emergency meeting: an alive player forces an immediate vote, once per game.
 *  Classic mode only (questions mode already ends on its single vote). */
export function callMeeting(io: Server, room: Room, playerId: string): string | null {
  if (room.settings.mode !== "classic") return "No meetings in this mode";
  if (room.phase !== "CLUES" && room.phase !== "DISCUSSION") return "Cannot call a meeting now";
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !player.alive) return "Only living players can call a meeting";
  if (room.emergencyUsedBy.includes(playerId)) return "You already used your meeting";
  room.emergencyUsedBy.push(playerId);
  startVoting(io, room);
  return null;
}

function resolveAfterVote(io: Server, room: Room): void {
  const elim = room.lastEliminated
    ? room.players.find((p) => p.id === room.lastEliminated)
    : null;

  // Questions mode: single vote decides it. Imposter caught -> civilians win.
  if (room.settings.mode === "questions") {
    const caught = elim?.role === "imposter";
    const impostorIds = room.players.filter((p) => p.role === "imposter").map((p) => p.id);
    const civilianIds = room.players.filter((p) => p.role === "civilian").map((p) => p.id);
    endGame(
      io,
      room,
      caught
        ? { team: "civilians", playerIds: civilianIds }
        : { team: "impostors", playerIds: impostorIds },
    );
    return;
  }

  if (elim && elim.role !== "civilian") {
    startLastGuess(io, room, elim);
    return;
  }
  const w = checkWinner(room);
  if (w) endGame(io, room, w);
  else startRound(io, room);
}

// ---- Last Guess ----------------------------------------------------------

function startLastGuess(io: Server, room: Room, guesser: Player): void {
  room.guesserId = guesser.id;
  enter(io, room, "LAST_GUESS", room.settings.guessSeconds, () => wrongGuess(io, room));
}

export function submitGuess(
  io: Server,
  room: Room,
  playerId: string,
  text: string,
): string | null {
  if (room.phase !== "LAST_GUESS") return "Not the guessing phase";
  if (room.guesserId !== playerId) return "It is not your guess";

  if (isCorrectGuess(text, room.civilianWord, room.aliases)) {
    endGame(io, room, { team: "guesser", playerIds: [playerId] });
  } else {
    wrongGuess(io, room);
  }
  return null;
}

export function acceptGuess(io: Server, room: Room, byHost: boolean): string | null {
  if (room.phase !== "LAST_GUESS") return "Not the guessing phase";
  if (!byHost) return "Only the host can accept";
  if (!room.guesserId) return "No one is guessing";
  endGame(io, room, { team: "guesser", playerIds: [room.guesserId] });
  return null;
}

function wrongGuess(io: Server, room: Room): void {
  room.guesserId = null;
  const w = checkWinner(room);
  if (w) endGame(io, room, w);
  else startRound(io, room);
}

// ---- Game over / replay --------------------------------------------------

function awardScores(room: Room, winner: Winner): void {
  const add = (id: string, pts: number) => {
    room.scores[id] = (room.scores[id] ?? 0) + pts;
  };
  if (winner.team === "guesser") {
    winner.playerIds.forEach((id) => add(id, room.settings.scoreGuesser)); // caught impostor who guessed right
  } else if (winner.team === "civilians") {
    room.players.filter((p) => p.role === "civilian").forEach((p) => add(p.id, room.settings.scoreCivilian));
  } else {
    room.players.filter((p) => p.role !== "civilian").forEach((p) => add(p.id, room.settings.scoreImpostor));
  }
}

function endGame(io: Server, room: Room, winner: Winner): void {
  room.winner = winner;
  room.guesserId = null;
  room.gamesPlayed += 1;
  awardScores(room, winner);
  enter(io, room, "GAME_OVER", null);
}

export function playAgain(io: Server, room: Room): string | null {
  if (room.phase !== "GAME_OVER") return "Game is not over";
  clearTimer(room);
  for (const p of room.players) {
    p.alive = true;
    p.role = undefined;
    p.word = undefined;
  }
  room.phase = "LOBBY";
  room.phaseEndsAt = null;
  room.round = 0;
  room.clues = [];
  room.answers = {};
  room.votes = {};
  room.turnOrder = [];
  room.turnIndex = 0;
  room.winner = null;
  room.lastEliminated = null;
  room.guesserId = null;
  room.civilianWord = "";
  room.doppelgangerWord = "";
  room.aliases = [];
  room.emergencyUsedBy = [];
  room.voteLog = [];
  // scores and gamesPlayed persist across the session.
  broadcast(io, room);
  return null;
}

export { clearTimer };
