import type { Room } from "../../shared/types";
import { teamOf } from "../../shared/types";

/** Count votes (missing vote = skip). Returns map target -> count, "skip" included. */
export function countVotes(room: Room): Record<string, number> {
  const counts: Record<string, number> = { skip: 0 };
  for (const p of room.players.filter((x) => x.alive)) {
    const target = room.votes[p.id] ?? "skip";
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

/** Eliminated player id, or null on a tie / skip majority / no votes. */
export function tallyVotes(room: Room): string | null {
  const counts = countVotes(room);
  const max = Math.max(...Object.values(counts));
  if (max === 0) return null;
  const leaders = Object.keys(counts).filter((k) => counts[k] === max);
  if (leaders.length > 1 || leaders[0] === "skip") return null;
  return leaders[0];
}

export function checkWinner(room: Room): Room["winner"] {
  const alive = room.players.filter((p) => p.alive);
  const impostorsAlive = alive.filter((p) => teamOf(p.role) === "impostors").length;
  const civiliansAlive = alive.filter((p) => teamOf(p.role) === "civilians").length;
  const impostorIds = room.players.filter((p) => teamOf(p.role) === "impostors").map((p) => p.id);
  const civilianIds = room.players.filter((p) => teamOf(p.role) === "civilians").map((p) => p.id);

  if (impostorsAlive === 0) return { team: "civilians", playerIds: civilianIds };
  if (impostorsAlive >= civiliansAlive) return { team: "impostors", playerIds: impostorIds };
  if (room.round >= room.settings.maxRounds) return { team: "impostors", playerIds: impostorIds };
  return null;
}
