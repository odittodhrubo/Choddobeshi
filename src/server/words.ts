import { getPack, getPacks, type Difficulty, type Pair } from "./content";

export type { Difficulty, Pair } from "./content";

/** Pairs the balance data says are too easy or too hard. Refreshed by the server. */
let excluded = new Set<string>();
export function setExcludedPairs(keys: Set<string>): void {
  excluded = keys;
}

export const pairKey = (packId: string, raw: { civilian: string; doppelganger: string }): string =>
  `${packId}:${raw.civilian}|${raw.doppelganger}`;

/**
 * Pick an unused pair from a pack and randomly swap which word is the
 * civilian word. `used` holds keys of pairs already played this session
 * (keys, not positions, so a content refresh can never cause repeats).
 */
export function pickPair(
  packId: string,
  used: string[],
  difficulty: Difficulty = "mixed",
): { pair: Pair; key: string } {
  const pack = getPack(packId) ?? getPack("en-general") ?? getPacks()[0];
  const all = pack.pairs;
  const keyOf = (p: Pair) => pairKey(pack.id, p);

  // Drop pairs flagged by balance data, unless that would empty the pool.
  const balanced = all.filter((p) => !excluded.has(keyOf(p)));
  const base = balanced.length ? balanced : all;
  const matchesDiff = (p: Pair) => difficulty === "mixed" || (p.difficulty ?? "medium") === difficulty;
  const unused = base.filter((p) => !used.includes(keyOf(p)) && matchesDiff(p));
  // Fall back: all of this difficulty, then the whole pack, so the game never stalls.
  const sameDiff = base.filter(matchesDiff);
  const pool = unused.length ? unused : sameDiff.length ? sameDiff : base;
  const raw = pool[Math.floor(Math.random() * pool.length)];

  const swap = Math.random() < 0.5;
  const pair: Pair = swap
    ? { civilian: raw.doppelganger, doppelganger: raw.civilian, aliases: [] }
    : { civilian: raw.civilian, doppelganger: raw.doppelganger, aliases: raw.aliases ?? [] };

  return { pair, key: keyOf(raw) };
}
