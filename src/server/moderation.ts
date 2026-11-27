// Lightweight moderation: profanity check + per-socket rate limiting.
// Not exhaustive — a deterrent for casual abuse, not a guarantee.

const BANNED = [
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard", "dick", "pussy",
  "nigger", "nigga", "faggot", "fag", "retard", "whore", "slut", "rape",
  "chutmarani", "madarchod", "magi", "khankir", "bokachoda", "chod",
];

const leet = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9ঀ-৿]/g, "") // keep latin, digits, Bangla
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/\$/g, "s");

export function containsProfanity(text: string): boolean {
  const t = leet(text);
  return BANNED.some((w) => t.includes(w));
}

/** Token-bucket rate limiter: `max` events per `windowMs` per socket. */
export function makeRateLimiter(max: number, windowMs: number) {
  let count = 0;
  let resetAt = Date.now() + windowMs;
  return function allow(): boolean {
    const now = Date.now();
    if (now > resetAt) {
      count = 0;
      resetAt = now + windowMs;
    }
    count += 1;
    return count <= max;
  };
}
