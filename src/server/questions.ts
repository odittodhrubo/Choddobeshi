import { getQuestions, type QuestionPair } from "./content";

export type { QuestionPair } from "./content";

/** Pick an unused question pair (by key); reuses the whole set once exhausted. */
export function pickQuestion(used: string[]): { pair: QuestionPair; key: string } {
  const all = getQuestions();
  const keyOf = (q: QuestionPair) => `q:${q.civilian}|${q.imposter}`;
  const unused = all.filter((q) => !used.includes(keyOf(q)));
  const pool = unused.length ? unused : all;
  const pair = pool[Math.floor(Math.random() * pool.length)];
  return { pair, key: keyOf(pair) };
}
