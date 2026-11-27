export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export type GameMode = "classic" | "questions";

export type Role =
  | "civilian"
  | "doppelganger"
  | "chameleon"
  | "imposter"
  | "jester"
  | "detective";

export type Team = "civilians" | "impostors" | "neutral";

/** Which side a role plays for. The Jester is neutral. */
export function teamOf(role?: Role): Team {
  if (role === "civilian" || role === "detective") return "civilians";
  if (role === "jester") return "neutral";
  return "impostors"; // doppelganger | chameleon | imposter
}

export type Phase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "CLUES"
  | "ANSWER"
  | "DISCUSSION"
  | "VOTING"
  | "VOTE_RESULT"
  | "LAST_GUESS"
  | "GAME_OVER";

export interface Player {
  id: string; // stable id stored in localStorage (survives refresh)
  socketId: string | null;
  name: string;
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  role?: Role; // server only
  word?: string | null; // server only
  userId?: string | null; // server only: Supabase auth user id, if signed in
  frame?: string; // cosmetic avatar frame (validated server-side)
  color?: string; // cosmetic avatar colour (validated server-side)
}

export interface Clue {
  playerId: string;
  round: number;
  text: string;
}

export interface WordPairInput {
  civilian: string;
  doppelganger: string;
}
export interface QuestionPairInput {
  civilian: string;
  imposter: string;
}
export interface VoteRecord {
  round: number;
  tally: Record<string, number>;
  votes: Record<string, string>; // voterId -> targetId | "skip"
  eliminatedId: string | null;
}

export const ACHIEVEMENTS = [
  { id: "first_game", label: "First Steps", desc: "Play your first game", icon: "🎮" },
  { id: "veteran", label: "Veteran", desc: "Play 10 games", icon: "🎖️" },
  { id: "winner", label: "On a Roll", desc: "Win 5 games", icon: "🏆" },
  { id: "impostor", label: "Master of Disguise", desc: "Win 5 times as impostor", icon: "🎭" },
  { id: "detective", label: "Sharp Eye", desc: "Win 10 times as civilian", icon: "🔍" },
  { id: "guesser", label: "Mind Reader", desc: "Guess the secret word", icon: "🎯" },
  { id: "century", label: "Centurion", desc: "Earn 100 points", icon: "💯" },
  { id: "streak3", label: "Regular", desc: "Play 3 days in a row", icon: "🔥" },
] as const;

export const WORD_PACKS: { id: string; name: string }[] = [
  { id: "en-general", name: "General" },
  { id: "en-food", name: "Food & Drink" },
  { id: "en-movies", name: "Movies & TV" },
  { id: "en-geography", name: "Geography" },
  { id: "bn-general", name: "বাংলা" },
  { id: "ai", name: "AI ✨" },
  { id: "custom", name: "Custom" },
];

/** Packs that rotate as the daily featured pack (winners earn a bonus point). */
const FEATURED_ROTATION = ["en-general", "en-food", "en-movies", "en-geography", "bn-general"];

/** Today's featured pack (UTC day, so server and clients always agree). */
export function featuredPack(now: number = Date.now()): string {
  const day = Math.floor(now / 86_400_000);
  return FEATURED_ROTATION[day % FEATURED_ROTATION.length];
}

/** Level from lifetime points. */
export function levelFor(points: number): number {
  return Math.floor(0.5 + Math.sqrt(Math.max(0, points) / 10)) + 1;
}

export const FRAMES = [
  { id: "none", label: "None", minLevel: 1 },
  { id: "bronze", label: "Bronze", minLevel: 2 },
  { id: "silver", label: "Silver", minLevel: 4 },
  { id: "gold", label: "Gold", minLevel: 6 },
  { id: "neon", label: "Neon", minLevel: 8 },
  { id: "rainbow", label: "Rainbow", minLevel: 10 },
] as const;

export const AVATAR_COLORS = [
  { id: "#ff6eb4", minLevel: 1 },
  { id: "#7c6cff", minLevel: 1 },
  { id: "#39d98a", minLevel: 1 },
  { id: "#ffcf5c", minLevel: 3 },
  { id: "#59c3ff", minLevel: 3 },
  { id: "#ff8f5c", minLevel: 5 },
  { id: "#c084fc", minLevel: 5 },
  { id: "#4be3c0", minLevel: 7 },
] as const;

export interface Settings {
  clueSeconds: number;
  discussionSeconds: number;
  voteSeconds: number;
  guessSeconds: number;
  maxRounds: number;
  questionRounds: number; // questions mode: answer rounds before the vote
  revealRoleOnEject: boolean;
  doppelgangers: number | "auto";
  chameleons: number | "auto";
  jester: boolean;
  detective: boolean;
  wordPack: string;
  difficulty: Difficulty;
  mode: GameMode;
  customWord: WordPairInput | null;
  customQuestion: QuestionPairInput | null;
  scoreCivilian: number;
  scoreImpostor: number;
  scoreGuesser: number;
  scoreJester: number;
}

export interface Winner {
  team: "civilians" | "impostors" | "guesser" | "jester";
  playerIds: string[];
}

export interface Peek {
  target: string;
  same: boolean;
}

export interface Room {
  code: string;
  players: Player[];
  settings: Settings;
  phase: Phase;
  phaseEndsAt: number | null;
  round: number;
  civilianWord: string;
  doppelgangerWord: string;
  aliases: string[]; // civilian-word aliases, for guess matching
  turnOrder: string[];
  turnIndex: number;
  clues: Clue[];
  answers: Record<string, string>; // questions mode: this round, playerId -> answer
  answerHistory: Record<string, string>[]; // questions mode: finished rounds
  votes: Record<string, string | "skip">;
  lastEliminated: string | null;
  guesserId: string | null; // the caught impostor during LAST_GUESS
  winner: Winner | null;
  usedPairs: number[]; // pack pair indices already played this session
  scores: Record<string, number>; // session leaderboard, by player id
  gamesPlayed: number;
  emergencyUsedBy: string[]; // player ids who used their meeting this game
  voteLog: VoteRecord[]; // per-vote history for the end-of-game recap
  aiRecent: string[]; // recent AI-generated words/questions, to reduce repeats
  ready: string[]; // players who pressed Ready on the role reveal
  muted: string[]; // players the host muted
  bans: string[]; // player ids / user ids banned from rejoining
  peeks: Record<string, Peek>; // detective id -> their one peek
  pairKey: string | null; // preset pair id, for balance stats
  reports: string[]; // "reporterId:targetId", to dedupe reports
  timer?: ReturnType<typeof setTimeout>; // server only
}

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  revealedRole?: Role;
  hasVoted?: boolean;
  hasAnswered?: boolean;
  ready?: boolean;
  muted?: boolean;
  frame?: string;
  color?: string;
}

export interface PlayerView {
  me: {
    id: string;
    word: string | null;
    isChameleon: boolean;
    specialRole?: "jester" | "detective"; // only for those two, never for impostors
    alive: boolean;
    isHost: boolean;
    myVote?: string; // my own current vote, during VOTING
    peek?: Peek; // my detective peek, once used
  };
  room: {
    code: string;
    phase: Phase;
    phaseEndsAt: number | null;
    round: number;
    settings: Settings;
    turnOrder: string[];
    turnIndex: number;
    clues: Clue[];
    mode: GameMode;
    answerRounds?: Record<string, string>[]; // finished answer rounds
    players: PublicPlayer[];
    lastEliminated: string | null;
    guesserId: string | null;
    winner: Winner | null;
    scores: Record<string, number>;
    gamesPlayed: number;
    emergencyUsedBy: string[];
    voteLog?: VoteRecord[]; // only at GAME_OVER
    lastVotes?: Record<string, string>; // who voted for whom, at VOTE_RESULT
    voteTally?: Record<string, number>;
    civilianWord?: string; // only at GAME_OVER
    doppelgangerWord?: string; // only at GAME_OVER
  };
}

export interface ChatMsg {
  from: string;
  text: string;
  ghost: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  clueSeconds: 30,
  discussionSeconds: 60,
  voteSeconds: 30,
  guessSeconds: 30,
  maxRounds: 6,
  questionRounds: 2,
  revealRoleOnEject: true,
  doppelgangers: "auto",
  chameleons: "auto",
  jester: false,
  detective: false,
  wordPack: "en-general",
  difficulty: "mixed",
  mode: "classic",
  customWord: null,
  customQuestion: null,
  scoreCivilian: 1,
  scoreImpostor: 2,
  scoreGuesser: 3,
  scoreJester: 3,
};
