import { describe, it, expect } from "vitest";
import type { Player, Room } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { tallyVotes, countVotes, checkWinner } from "../game/votes";
import { isCorrectGuess, normalize } from "../game/guess";
import { defaultCounts, makeTurnOrder, validateRoleMix } from "../game/roles";
import { teamOf, featuredPack, levelFor } from "../../shared/types";
import { containsProfanity } from "../moderation";
import { pickPair, setExcludedPairs, pairKey } from "../words";
import { pickQuestion } from "../questions";
import { getPack, getPacks, getQuestions, contentSource } from "../content";
import { validateClue } from "../game/engine";

function mkPlayer(id: string, role: Player["role"], alive = true): Player {
  return {
    id,
    socketId: null,
    name: id,
    isHost: false,
    connected: true,
    alive,
    role,
    word: role === "chameleon" ? null : role === "doppelganger" ? "Tea" : "Coffee",
  };
}

function mkRoom(players: Player[], votes: Record<string, string> = {}, round = 1): Room {
  return {
    code: "TEST",
    players,
    settings: { ...DEFAULT_SETTINGS },
    phase: "VOTING",
    phaseEndsAt: null,
    round,
    civilianWord: "Coffee",
    doppelgangerWord: "Tea",
    aliases: [],
    turnOrder: [],
    turnIndex: 0,
    clues: [],
    answers: {},
    votes,
    lastEliminated: null,
    guesserId: null,
    winner: null,
    usedPairs: [],
    scores: {},
    gamesPlayed: 0,
    emergencyUsedBy: [],
    voteLog: [],
    aiRecent: [],
    answerHistory: [],
    ready: [],
    muted: [],
    bans: [],
    peeks: {},
    pairKey: null,
    reports: [],
  };
}

describe("tallyVotes", () => {
  const roster = () => [
    mkPlayer("a", "civilian"),
    mkPlayer("b", "civilian"),
    mkPlayer("c", "civilian"),
    mkPlayer("d", "chameleon"),
  ];

  it("ejects the clear leader", () => {
    const room = mkRoom(roster(), { a: "d", b: "d", c: "d", d: "a" });
    expect(tallyVotes(room)).toBe("d");
  });
  it("returns null on a tie", () => {
    const room = mkRoom(roster(), { a: "c", b: "d", c: "d", d: "c" });
    expect(tallyVotes(room)).toBeNull();
  });
  it("returns null when skip wins", () => {
    const room = mkRoom(roster(), { a: "skip", b: "skip", c: "skip", d: "a" });
    expect(tallyVotes(room)).toBeNull();
  });
  it("counts missing votes as skip", () => {
    const room = mkRoom(roster(), { a: "b" });
    expect(tallyVotes(room)).toBeNull();
    expect(countVotes(room).skip).toBe(3);
  });
});

describe("checkWinner", () => {
  it("civilians win when no impostors remain", () => {
    const room = mkRoom([
      mkPlayer("a", "civilian"),
      mkPlayer("b", "civilian"),
      mkPlayer("c", "chameleon", false),
    ]);
    expect(checkWinner(room)?.team).toBe("civilians");
  });
  it("impostors win at parity", () => {
    const room = mkRoom([
      mkPlayer("a", "civilian"),
      mkPlayer("b", "chameleon"),
    ]);
    expect(checkWinner(room)?.team).toBe("impostors");
  });
  it("impostors win at the round limit", () => {
    const room = mkRoom(
      [mkPlayer("a", "civilian"), mkPlayer("b", "civilian"), mkPlayer("c", "civilian"), mkPlayer("d", "chameleon")],
      {},
      6,
    );
    expect(checkWinner(room)?.team).toBe("impostors");
  });
  it("no winner mid-game", () => {
    const room = mkRoom(
      [mkPlayer("a", "civilian"), mkPlayer("b", "civilian"), mkPlayer("c", "civilian"), mkPlayer("d", "chameleon")],
      {},
      2,
    );
    expect(checkWinner(room)).toBeNull();
  });
});

describe("isCorrectGuess", () => {
  it("matches exact, case and whitespace", () => {
    expect(isCorrectGuess("  COFFEE ", "Coffee")).toBe(true);
  });
  it("allows a same-length single-letter typo", () => {
    expect(isCorrectGuess("guifar", "Guitar")).toBe(true);
  });
  it("rejects a shorter real word (place vs palace)", () => {
    expect(isCorrectGuess("place", "Palace")).toBe(false);
  });
  it("rejects a length-changing near-word", () => {
    expect(isCorrectGuess("coffe", "Coffee")).toBe(false);
  });
  it("matches an alias", () => {
    expect(isCorrectGuess("fb", "Facebook", ["fb"])).toBe(true);
  });
  it("rejects a wrong word", () => {
    expect(isCorrectGuess("tea", "Coffee")).toBe(false);
  });
  it("handles Bangla NFC", () => {
    expect(isCorrectGuess("ইলিশ", "ইলিশ".normalize("NFD"))).toBe(true);
  });
});

describe("defaultCounts", () => {
  it("keeps civilians a majority for 4..12", () => {
    for (let n = 4; n <= 12; n++) {
      const { d, c } = defaultCounts(n);
      expect(d + c).toBeLessThan(n - (d + c));
    }
  });
});

describe("makeTurnOrder", () => {
  it("never puts the chameleon first in round 1", () => {
    const players = [
      mkPlayer("a", "chameleon"),
      mkPlayer("b", "civilian"),
      mkPlayer("c", "civilian"),
      mkPlayer("d", "civilian"),
    ];
    for (let i = 0; i < 50; i++) {
      const room = mkRoom(players, {}, 1);
      const order = makeTurnOrder(room);
      const firstRole = players.find((p) => p.id === order[0])!.role;
      expect(firstRole).not.toBe("chameleon");
    }
  });
});

describe("validateClue", () => {
  const room = mkRoom([mkPlayer("a", "civilian")]);
  const player = room.players[0];

  it("rejects the player's own word", () => {
    expect(validateClue(room, player, "coffee")).toBeTruthy();
  });
  it("rejects multi-word clues", () => {
    expect(validateClue(room, player, "hot drink")).toBeTruthy();
  });
  it("rejects a repeat", () => {
    const r2 = mkRoom([mkPlayer("a", "civilian")]);
    r2.clues.push({ playerId: "x", round: 1, text: "beans" });
    expect(validateClue(r2, r2.players[0], "BEANS")).toBeTruthy();
  });
  it("accepts a fresh valid clue", () => {
    expect(validateClue(room, player, "beans")).toBeNull();
  });
});

describe("normalize", () => {
  it("strips punctuation and lowercases", () => {
    expect(normalize("  Café! ")).toBe("café");
  });
});

describe("jester and detective", () => {
  it("teamOf puts the detective with civilians and the jester on neither side", () => {
    expect(teamOf("detective")).toBe("civilians");
    expect(teamOf("civilian")).toBe("civilians");
    expect(teamOf("jester")).toBe("neutral");
    expect(teamOf("doppelganger")).toBe("impostors");
    expect(teamOf("chameleon")).toBe("impostors");
    expect(teamOf("imposter")).toBe("impostors");
  });

  it("a living jester or detective is never counted as an impostor", () => {
    const room = mkRoom([
      mkPlayer("a", "civilian"),
      mkPlayer("b", "detective"),
      mkPlayer("c", "jester"),
      mkPlayer("d", "chameleon"),
      mkPlayer("e", "civilian"),
    ]);
    // 3 civilians-side vs 1 impostor -> no winner yet, jester does not tip parity.
    expect(checkWinner(room)).toBeNull();
  });

  it("civilians win when the last impostor is gone, jester excluded from winners", () => {
    const room = mkRoom([
      mkPlayer("a", "civilian"),
      mkPlayer("b", "detective"),
      mkPlayer("c", "jester"),
      mkPlayer("d", "chameleon", false),
    ]);
    const w = checkWinner(room);
    expect(w?.team).toBe("civilians");
    expect(w?.playerIds.sort()).toEqual(["a", "b"]);
  });

  it("validateRoleMix rejects specials that leave no plain civilian", () => {
    const s = { ...DEFAULT_SETTINGS, jester: true, detective: true, doppelgangers: 1, chameleons: 1 } as typeof DEFAULT_SETTINGS;
    expect(() => validateRoleMix(4, s)).toThrow();
    expect(() => validateRoleMix(7, s)).not.toThrow();
  });
});

describe("misc rules", () => {
  it("featuredPack is stable within a UTC day", () => {
    const t = Date.UTC(2026, 0, 5, 3);
    expect(featuredPack(t)).toBe(featuredPack(t + 3600_000));
  });
  it("levelFor grows with points", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(1000)).toBeGreaterThan(levelFor(10));
  });
  it("profanity filter catches leetspeak", () => {
    expect(containsProfanity("sh1t")).toBe(true);
    expect(containsProfanity("hello friend")).toBe(false);
  });
});

describe("content store (built-in fallback)", () => {
  it("falls back to the bundled packs when the database is not used", () => {
    expect(contentSource()).toBe("builtin");
    expect(getPacks().length).toBeGreaterThanOrEqual(5);
    expect(getPack("en-general")?.pairs.length).toBeGreaterThan(50);
    expect(getQuestions().length).toBeGreaterThan(30);
  });

  it("pickPair returns a stable key and avoids pairs already played", () => {
    const used: string[] = [];
    const seen = new Set<string>();
    const total = getPack("en-food")!.pairs.length;
    for (let i = 0; i < total; i++) {
      const { key } = pickPair("en-food", used, "mixed");
      expect(used.includes(key)).toBe(false);
      used.push(key);
      seen.add(key);
    }
    expect(seen.size).toBe(total); // never repeated before the pack ran out
  });

  it("pickPair falls back to General for an unknown pack", () => {
    const { key } = pickPair("does-not-exist", [], "mixed");
    expect(key.startsWith("en-general:")).toBe(true);
  });

  it("pickPair skips pairs flagged by balance data", () => {
    const pack = getPack("en-geography")!;
    const [keep, ...rest] = pack.pairs;
    setExcludedPairs(new Set(rest.map((p) => pairKey(pack.id, p))));
    for (let i = 0; i < 20; i++) {
      expect(pickPair("en-geography", [], "mixed").key).toBe(pairKey(pack.id, keep));
    }
    setExcludedPairs(new Set());
  });

  it("pickPair still works if every pair is flagged (never stalls)", () => {
    const pack = getPack("en-movies")!;
    setExcludedPairs(new Set(pack.pairs.map((p) => pairKey(pack.id, p))));
    expect(() => pickPair("en-movies", [], "mixed")).not.toThrow();
    setExcludedPairs(new Set());
  });

  it("pickQuestion cycles through every question before repeating", () => {
    const used: string[] = [];
    const n = getQuestions().length;
    const keys = new Set<string>();
    for (let i = 0; i < n; i++) {
      const { key } = pickQuestion(used);
      keys.add(key);
      used.push(key);
    }
    expect(keys.size).toBe(n);
    expect(() => pickQuestion(used)).not.toThrow(); // exhausted -> reuses
  });
});
