import type { Player, Room, Settings } from "../../shared/types";

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Auto impostor counts, always keeping civilians > impostors. */
export function defaultCounts(n: number): { d: number; c: number } {
  if (n <= 4) return Math.random() < 0.5 ? { d: 1, c: 0 } : { d: 0, c: 1 };
  if (n <= 7) return { d: 1, c: 1 };
  if (n <= 9) return { d: 2, c: 1 };
  return { d: 2, c: 2 };
}

export function resolveCounts(n: number, s: Settings): { d: number; c: number } {
  if (s.doppelgangers === "auto" || s.chameleons === "auto") return defaultCounts(n);
  return { d: s.doppelgangers, c: s.chameleons };
}

/** Questions mode: imposter count (kept a minority). */
export function questionImposters(n: number): number {
  return n >= 8 ? 2 : 1;
}

/** Questions mode: imposters get the imposter question, civilians the civilian one.
 *  Nobody is told their role — the imposter must notice their question is odd. */
export function assignQuestionRoles(
  room: Room,
  pair: { civilian: string; imposter: string },
): void {
  const n = room.players.length;
  const imposters = questionImposters(n);
  const shuffled = shuffle(room.players);
  shuffled.forEach((p: Player, i) => {
    p.alive = true;
    if (i < imposters) {
      p.role = "imposter";
      p.word = pair.imposter;
    } else {
      p.role = "civilian";
      p.word = pair.civilian;
    }
  });
  room.civilianWord = pair.civilian;
  room.doppelgangerWord = pair.imposter; // reused as "the other question" for reveal
  room.aliases = [];
}

export function assignRoles(
  room: Room,
  pair: { civilian: string; doppelganger: string; aliases: string[] },
): void {
  const n = room.players.length;
  const { d, c } = resolveCounts(n, room.settings);
  if (d + c < 1) throw new Error("Need at least 1 impostor");
  if (d + c >= n - (d + c)) throw new Error("Too many impostors for this player count");

  const shuffled = shuffle(room.players);
  shuffled.forEach((p: Player, i) => {
    p.alive = true;
    if (i < d) {
      p.role = "doppelganger";
      p.word = pair.doppelganger;
    } else if (i < d + c) {
      p.role = "chameleon";
      p.word = null;
    } else {
      p.role = "civilian";
      p.word = pair.civilian;
    }
  });

  room.civilianWord = pair.civilian;
  room.doppelgangerWord = pair.doppelganger;
  room.aliases = pair.aliases ?? [];
}

/** Random speaking order; Chameleon never speaks first in round 1. */
export function makeTurnOrder(room: Room): string[] {
  const alive = shuffle(room.players.filter((p) => p.alive));
  if (room.round === 1 && alive.length > 1 && alive[0]?.role === "chameleon") {
    const swap = alive.findIndex((p) => p.role !== "chameleon");
    if (swap > 0) [alive[0], alive[swap]] = [alive[swap], alive[0]];
  }
  return alive.map((p) => p.id);
}
