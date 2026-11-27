export const normalize = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ");

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

export function isCorrectGuess(
  guess: string,
  word: string,
  aliases: string[] = [],
): boolean {
  const g = normalize(guess);
  if (!g) return false;
  const targets = [word, ...aliases].map(normalize);
  // Exact or alias, or a same-length single-letter typo (fat-finger).
  // Length-changing near-words (place vs palace) are NOT auto-accepted —
  // the host's Accept button covers real typos/synonyms.
  return targets.some(
    (t) => g === t || (t.length > 4 && g.length === t.length && levenshtein(g, t) === 1),
  );
}
