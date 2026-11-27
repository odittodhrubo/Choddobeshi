import questions from "./words/questions.json";

export interface QuestionPair {
  civilian: string;
  imposter: string;
}

const pack = questions as { id: string; name: string; pairs: QuestionPair[] };

/** Pick an unused question pair; falls back to the whole pack when exhausted. */
export function pickQuestion(used: number[]): { pair: QuestionPair; index: number } {
  const unused = pack.pairs.map((_, i) => i).filter((i) => !used.includes(i));
  const pool = unused.length ? unused : pack.pairs.map((_, i) => i);
  const index = pool[Math.floor(Math.random() * pool.length)];
  return { pair: pack.pairs[index], index };
}
