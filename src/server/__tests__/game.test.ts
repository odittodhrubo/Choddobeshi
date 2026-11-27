import { describe, it, expect } from "vitest";
import type { Player, Room } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { tallyVotes, countVotes, checkWinner } from "../game/votes";
import { isCorrectGuess, normalize } from "../game/guess";
import { defaultCounts, makeTurnOrder } from "../game/roles";
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
