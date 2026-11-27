export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export type GameMode = "classic" | "questions";

export type Role = "civilian" | "doppelganger" | "chameleon" | "imposter";

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

export interface Settings {
  clueSeconds: number;
  discussionSeconds: number;
  voteSeconds: number;
  guessSeconds: number;
  maxRounds: number;
  revealRoleOnEject: boolean;
  doppelgangers: number | "auto";
  chameleons: number | "auto";
  wordPack: string;
  difficulty: Difficulty;
  mode: GameMode;
  customWord: WordPairInput | null;
  customQuestion: QuestionPairInput | null;
  scoreCivilian: number;
  scoreImpostor: number;
  scoreGuesser: number;
}

export interface Winner {
  team: "civilians" | "impostors" | "guesser";
  playerIds: string[];
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
  answers: Record<string, string>; // questions mode: playerId -> answer
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
}

export interface PlayerView {
  me: {
    id: string;
    word: string | null;
    isChameleon: boolean;
    alive: boolean;
    isHost: boolean;
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
    answers?: Record<string, string>; // revealed from DISCUSSION onward
    players: PublicPlayer[];
    lastEliminated: string | null;
    guesserId: string | null;
    winner: Winner | null;
    scores: Record<string, number>;
    gamesPlayed: number;
    emergencyUsedBy: string[];
    voteLog?: VoteRecord[]; // only at GAME_OVER
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
  revealRoleOnEject: true,
  doppelgangers: "auto",
  chameleons: "auto",
  wordPack: "en-general",
  difficulty: "mixed",
  mode: "classic",
  customWord: null,
  customQuestion: null,
  scoreCivilian: 1,
  scoreImpostor: 2,
  scoreGuesser: 3,
};
