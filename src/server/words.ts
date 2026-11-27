import en from "./words/en.json";
import bn from "./words/bn.json";
import movies from "./words/movies.json";
import food from "./words/food.json";
import geography from "./words/geography.json";

export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export interface Pair {
  civilian: string;
  doppelganger: string;
  aliases: string[];
  difficulty?: Difficulty;
}
export interface Pack {
  id: string;
  name: string;
  pairs: Pair[];
}

const packs: Record<string, Pack> = {
  [en.id]: en as Pack,
  [food.id]: food as Pack,
  [movies.id]: movies as Pack,
  [geography.id]: geography as Pack,
  [bn.id]: bn as Pack,
};

export function listPacks(): { id: string; name: string }[] {
  return Object.values(packs).map((p) => ({ id: p.id, name: p.name }));
}

/**
 * Pick an unused pair from a pack and randomly swap which word is the
 * civilian word. Returns the chosen pair plus its index, so the room can
 * avoid repeats within one session.
 */
export function pickPair(
  packId: string,
  used: number[],
  difficulty: Difficulty = "mixed",
): { pair: Pair; index: number } {
  const pack = packs[packId] ?? packs[en.id];
  const matchesDiff = (i: number) =>
    difficulty === "mixed" || (pack.pairs[i].difficulty ?? "medium") === difficulty;
  const unused = pack.pairs.map((_, i) => i).filter((i) => !used.includes(i) && matchesDiff(i));
  // Fall back: all of this difficulty, then the whole pack, so the game never stalls.
  const sameDiff = pack.pairs.map((_, i) => i).filter(matchesDiff);
  const pool = unused.length ? unused : sameDiff.length ? sameDiff : pack.pairs.map((_, i) => i);
  const index = pool[Math.floor(Math.random() * pool.length)];
  const raw = pack.pairs[index];

  const swap = Math.random() < 0.5;
  const pair: Pair = swap
    ? { civilian: raw.doppelganger, doppelganger: raw.civilian, aliases: [] }
    : { civilian: raw.civilian, doppelganger: raw.doppelganger, aliases: raw.aliases ?? [] };

  return { pair, index };
}
