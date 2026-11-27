import type { Server } from "socket.io";
import type { Player, Room, Winner, Peek } from "../../shared/types";
import { teamOf, featuredPack } from "../../shared/types";
import { assignRoles, assignQuestionRoles, makeTurnOrder } from "./roles";
import { tallyVotes, checkWinner, countVotes } from "./votes";
import { isCorrectGuess, normalize } from "./guess";
import { pickPair } from "../words";
import { pickQuestion } from "../questions";
import { generateWordPair, generateQuestionPair } from "../ai";
import { broadcast } from "./view";
import { recordResult, recordPair } from "../supabase";

const REVEAL_SECONDS = 20; // upper bound; ends early once everyone is ready
const VOTE_GRACE_SECONDS = 5; // after the last vote, time left to change your mind
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

export async function startGame(io: Server, room: Room): Promise<string | null> {
  if (room.phase !== "LOBBY") return "Game already started";
  if (room.players.length < 4) return "Need at least 4 players";

  const questions = room.settings.mode === "questions";
  const custom = room.settings.wordPack === "custom";
  const ai = room.settings.wordPack === "ai";
  let key: string | null = null;
  try {
    if (questions) {
      if (custom && room.settings.customQuestion) {
        assignQuestionRoles(room, room.settings.customQuestion);
      } else if (ai) {
        const q = await generateQuestionPair(room.aiRecent);
        if (q) {
          room.aiRecent.push(q.civilian);
          assignQuestionRoles(room, q);
        } else {
          const { pair, index } = pickQuestion(room.usedPairs);
          room.usedPairs.push(index);
          assignQuestionRoles(room, pair);
        }
      } else {
        const { pair, index } = pickQuestion(room.usedPairs);
        room.usedPairs.push(index);
        assignQuestionRoles(room, pair);
      }
    } else if (custom && room.settings.customWord) {
      assignRoles(room, { ...room.settings.customWord, aliases: [] });
    } else if (ai) {
      const p = await generateWordPair(room.settings.difficulty, room.aiRecent);
      if (p) {
        room.aiRecent.push(p.civilian);
        assignRoles(room, { ...p, aliases: [] });
      } else {
        const { pair, index } = pickPair("en-general", room.usedPairs, room.settings.difficulty);
        room.usedPairs.push(index);
        assignRoles(room, pair);
      }
    } else {
      const { pair, index, key: k } = pickPair(room.settings.wordPack, room.usedPairs, room.settings.difficulty);
      room.usedPairs.push(index);
      key = k;
      assignRoles(room, pair);
    }
  } catch (e) {
    return (e as Error).message;
  }

  // A late second start (during the AI await) is a no-op.
  if (room.phase !== "LOBBY") return null;

  room.round = 0;
  room.clues = [];
  room.answers = {};
  room.votes = {};
  room.winner = null;
  room.lastEliminated = null;
  room.guesserId = null;
  room.emergencyUsedBy = [];
  room.voteLog = [];
  room.answerHistory = [];
  room.ready = [];
  room.peeks = {};
  room.reports = [];
  room.pairKey = key;

  enter(io, room, "ROLE_REVEAL", REVEAL_SECONDS, () => afterReveal(io, room));
  return null;
}

/** Leave the role reveal: into the first clue round or the first answer round. */
function afterReveal(io: Server, room: Room): void {
  if (room.phase !== "ROLE_REVEAL") return;
  if (room.settings.mode === "questions") startAnswer(io, room);
  else startRound(io, room);
}

/** A player is ready. When everyone still connected is ready, skip the wait. */
export function setReady(io: Server, room: Room, playerId: string): string | null {
  if (room.phase !== "ROLE_REVEAL") return "Not the role reveal";
  if (!room.players.some((p) => p.id === playerId)) return "Not in this room";
  if (!room.ready.includes(playerId)) room.ready.push(playerId);

  const waiting = room.players.filter((p) => p.connected && !room.ready.includes(p.id));
  if (waiting.length === 0) afterReveal(io, room);
  else broadcast(io, room);
  return null;
}

// ---- Answer phase (questions mode) --------------------------------------

function startAnswer(io: Server, room: Room): void {
  room.round = 1;
  room.answers = {};
  room.answerHistory = [];
  room.votes = {};
  enter(io, room, "ANSWER", room.settings.clueSeconds, () => endAnswerRound(io, room));
}

/** Close the current answer round: archive it, then next round or discussion. */
function endAnswerRound(io: Server, room: Room): void {
  if (room.phase !== "ANSWER") return;
  room.answerHistory.push({ ...room.answers });
  if (room.round < room.settings.questionRounds) {
    room.round += 1;
    room.answers = {};
    enter(io, room, "ANSWER", room.settings.clueSeconds, () => endAnswerRound(io, room));
  } else {
    toDiscussion(io, room);
  }
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
  if (playerId in room.answers) return "You already answered this round";

  const norm = normalize(text);
  const used = [...room.answerHistory, room.answers].some((round) =>
    Object.values(round).some((a) => normalize(a) === norm),
  );
  if (used) return "That answer was already used";

  room.answers[playerId] = text.trim();

  if (alivePlayers(room).every((p) => p.id in room.answers)) {
    endAnswerRound(io, room);
  } else {
    broadcast(io, room);
  }
  return null;
}

/** Host: stop waiting for slow or AFK players and close the round now. */
export function skipAnswerWait(io: Server, room: Room): string | null {
  if (room.phase !== "ANSWER") return "Not the answer phase";
  endAnswerRound(io, room);
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

/** Host: skip the current speaker's turn (AFK player). */
export function skipTurn(io: Server, room: Room): string | null {
  if (room.phase !== "CLUES") return "Not the clue phase";
  onClueTimeout(io, room);
  return null;
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

  room.votes[voterId] = target as string | "skip"; // a re-vote simply replaces it

  // Everyone has voted: don't resolve instantly (people may still change their
  // mind). Shorten the wait to a short grace window instead.
  if (alivePlayers(room).every((p) => p.id in room.votes)) {
    const left = room.phaseEndsAt != null ? room.phaseEndsAt - Date.now() : Infinity;
    if (left > VOTE_GRACE_SECONDS * 1000) {
      clearTimer(room);
      room.phaseEndsAt = Date.now() + VOTE_GRACE_SECONDS * 1000;
      room.timer = setTimeout(() => doTally(io, room), VOTE_GRACE_SECONDS * 1000);
    }
  }
  broadcast(io, room);
  return null;
}

function doTally(io: Server, room: Room): void {
  const eliminatedId = tallyVotes(room);
  room.lastEliminated = eliminatedId;
  const votes: Record<string, string> = {};
  for (const p of alivePlayers(room)) votes[p.id] = room.votes[p.id] ?? "skip";
  room.voteLog.push({ round: room.round, tally: countVotes(room), votes, eliminatedId });
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
    const impostorIds = room.players.filter((p) => teamOf(p.role) === "impostors").map((p) => p.id);
    const civilianIds = room.players.filter((p) => teamOf(p.role) === "civilians").map((p) => p.id);
    endGame(
      io,
      room,
      caught
        ? { team: "civilians", playerIds: civilianIds }
        : { team: "impostors", playerIds: impostorIds },
    );
    return;
  }

  // The Jester wins alone the moment they are voted out.
  if (elim && elim.role === "jester") {
    endGame(io, room, { team: "jester", playerIds: [elim.id] });
    return;
  }

  // Only a caught impostor gets a last guess.
  if (elim && teamOf(elim.role) === "impostors") {
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

/** Points each player earns this game, by player id. */
function pointsThisGame(room: Room, winner: Winner): Record<string, number> {
  const pts: Record<string, number> = {};
  const set = (ids: string[], n: number) => ids.forEach((id) => (pts[id] = n));
  const byTeam = (t: "civilians" | "impostors") =>
    room.players.filter((p) => teamOf(p.role) === t).map((p) => p.id);

  if (winner.team === "guesser") set(winner.playerIds, room.settings.scoreGuesser);
  else if (winner.team === "jester") set(winner.playerIds, room.settings.scoreJester);
  else if (winner.team === "civilians") set(byTeam("civilians"), room.settings.scoreCivilian);
  else set(byTeam("impostors"), room.settings.scoreImpostor);

  // Daily featured pack: every winner earns +1.
  if (room.settings.wordPack === featuredPack()) {
    for (const id of winner.playerIds) pts[id] = (pts[id] ?? 0) + 1;
  }
  return pts;
}

/** Best-effort: persist each signed-in player's result to Supabase. */
function persistResults(room: Room, winner: Winner, pts: Record<string, number>): void {
  for (const p of room.players) {
    if (!p.userId || !p.role) continue;
    const team = teamOf(p.role);
    void recordResult({
      userId: p.userId,
      role: team === "civilians" ? "civilian" : team === "neutral" ? "jester" : "impostor",
      won: winner.playerIds.includes(p.id),
      winTeam: winner.team,
      points: pts[p.id] ?? 0,
    });
  }
  // Balance data: did the impostor side win this preset pair?
  if (room.pairKey) {
    void recordPair(room.pairKey, winner.team === "impostors" || winner.team === "guesser");
  }
}

function endGame(io: Server, room: Room, winner: Winner): void {
  room.winner = winner;
  room.guesserId = null;
  room.gamesPlayed += 1;
  const pts = pointsThisGame(room, winner);
  for (const [id, n] of Object.entries(pts)) room.scores[id] = (room.scores[id] ?? 0) + n;
  persistResults(room, winner, pts);
  enter(io, room, "GAME_OVER", null);
}

/** Detective: once per game, learn whether another player shares your word. */
export function detectivePeek(
  io: Server,
  room: Room,
  playerId: string,
  targetId: string,
): { error?: string; peek?: Peek } {
  const me = room.players.find((p) => p.id === playerId);
  if (!me || me.role !== "detective") return { error: "Only the Detective can peek" };
  if (!me.alive) return { error: "You are out of the game" };
  if (!["CLUES", "DISCUSSION", "VOTING"].includes(room.phase)) return { error: "You cannot peek now" };
  if (room.peeks[playerId]) return { error: "You already used your peek" };
  const target = room.players.find((p) => p.id === targetId);
  if (!target || target.id === playerId) return { error: "Pick another player" };

  // Same word: civilians, the jester and fellow detective hold the civilian word.
  // Doppelganger holds a different word; the chameleon holds none.
  const same = target.word != null && me.word != null && target.word === me.word;
  const peek: Peek = { target: target.id, same };
  room.peeks[playerId] = peek;
  broadcast(io, room);
  return { peek };
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
  room.answerHistory = [];
  room.ready = [];
  room.peeks = {};
  room.reports = [];
  room.pairKey = null;
  // scores, mutes and bans persist across the session.
  broadcast(io, room);
  return null;
}

/** Re-arm the current phase's timer after a restart, using the stored deadline. */
export function resume(io: Server, room: Room): void {
  if (room.phaseEndsAt == null) return; // LOBBY / GAME_OVER: nothing to schedule
  const remMs = Math.max(0, room.phaseEndsAt - Date.now());
  const sched = (fn: () => void) => {
    clearTimer(room);
    room.timer = setTimeout(fn, remMs);
  };
  switch (room.phase) {
    case "ROLE_REVEAL":
      sched(() => afterReveal(io, room));
      break;
    case "CLUES":
      sched(() => onClueTimeout(io, room));
      break;
    case "ANSWER":
      sched(() => endAnswerRound(io, room));
      break;
    case "DISCUSSION":
      sched(() => startVoting(io, room));
      break;
    case "VOTING":
      sched(() => doTally(io, room));
      break;
    case "VOTE_RESULT":
      sched(() => resolveAfterVote(io, room));
      break;
    case "LAST_GUESS":
      sched(() => wrongGuess(io, room));
      break;
  }
}

export { clearTimer };
