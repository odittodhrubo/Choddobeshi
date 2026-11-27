import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FRAMES, AVATAR_COLORS, levelFor } from "../shared/types";

// Read env lazily: with the custom server, Next loads .env.local during
// app.prepare(), AFTER this module is first imported. Reading at call time
// (not import time) ensures the keys are present.

let verifier: SupabaseClient | null | undefined;
let admin: SupabaseClient | null | undefined;

function getVerifier(): SupabaseClient | null {
  if (verifier === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    verifier = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return verifier;
}

/** Server-only Supabase client using the secret key, or null if not configured. */
export function adminClient(): SupabaseClient | null {
  return getAdmin();
}

function getAdmin(): SupabaseClient | null {
  if (admin === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    admin = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return admin;
}

/** Verify a Supabase access token, returning the user id or null. */
export async function verifyToken(token: string | undefined): Promise<string | null> {
  const sb = getVerifier();
  if (!sb || !token) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Record one player's game result. No-op until the secret key is configured. */
export async function recordResult(args: {
  userId: string;
  role: "civilian" | "impostor" | "jester";
  won: boolean;
  winTeam: "civilians" | "impostors" | "guesser" | "jester";
  points: number;
}): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  try {
    await sb.rpc("record_result", {
      p_user: args.userId,
      p_role: args.role,
      p_won: args.won,
      p_win_team: args.winTeam,
      p_points: args.points,
    });
    await awardAchievements(sb, args.userId);
  } catch {
    // Stats are best-effort; never break a game over a failed write.
  }
}

interface StatRow {
  games: number;
  wins: number;
  imp_wins: number;
  civ_wins: number;
  guesser_wins: number;
  points: number;
  streak_days: number;
  best_streak: number;
}

const ACHIEVEMENT_CHECKS: Record<string, (s: StatRow) => boolean> = {
  first_game: (s) => s.games >= 1,
  veteran: (s) => s.games >= 10,
  winner: (s) => s.wins >= 5,
  impostor: (s) => s.imp_wins >= 5,
  detective: (s) => s.civ_wins >= 10,
  guesser: (s) => s.guesser_wins >= 1,
  century: (s) => s.points >= 100,
  streak3: (s) => Math.max(s.streak_days, s.best_streak) >= 3,
};

async function awardAchievements(sb: SupabaseClient, userId: string): Promise<void> {
  let { data: stats, error } = await sb
    .from("player_stats")
    .select("games,wins,imp_wins,civ_wins,guesser_wins,points,streak_days,best_streak")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Streak columns appear with migrations_v3; fall back so achievements keep working before it runs.
    ({ data: stats } = await sb
      .from("player_stats")
      .select("games,wins,imp_wins,civ_wins,guesser_wins,points")
      .eq("user_id", userId)
      .maybeSingle());
  }
  if (!stats) return;
  const s = stats as StatRow;
  s.streak_days ??= 0;
  s.best_streak ??= 0;

  const earned = Object.entries(ACHIEVEMENT_CHECKS)
    .filter(([, check]) => check(s))
    .map(([id]) => ({ user_id: userId, achievement: id }));
  if (earned.length) {
    await sb.from("user_achievements").upsert(earned, { onConflict: "user_id,achievement", ignoreDuplicates: true });
  }
}

// ---- Word-pair balance ---------------------------------------------------

/** Log whether the impostor side won a game that used a preset word pair. */
export async function recordPair(key: string, impostorWon: boolean): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  try {
    await sb.rpc("record_pair", { p_key: key, p_impostor_won: impostorWon });
  } catch {
    // best-effort
  }
}

const MIN_PLAYS = 10;
const TOO_HARD_FOR_IMPOSTOR = 0.15; // impostors almost never win: pair is too easy
const TOO_EASY_FOR_IMPOSTOR = 0.85; // impostors almost always win: pair is too hard

/** Pair keys whose results are lopsided enough to drop from rotation. */
export async function loadExcludedPairs(): Promise<Set<string>> {
  const sb = getAdmin();
  const out = new Set<string>();
  if (!sb) return out;
  try {
    const { data } = await sb.from("pair_stats").select("pair_key,plays,impostor_wins").gte("plays", MIN_PLAYS);
    for (const r of (data ?? []) as { pair_key: string; plays: number; impostor_wins: number }[]) {
      const rate = r.impostor_wins / r.plays;
      if (rate <= TOO_HARD_FOR_IMPOSTOR || rate >= TOO_EASY_FOR_IMPOSTOR) out.add(r.pair_key);
    }
  } catch {
    // keep an empty set
  }
  return out;
}

// ---- Cosmetics -----------------------------------------------------------

/** The user's chosen frame/colour, but only if their level has unlocked it. */
export async function loadCosmetics(userId: string): Promise<{ frame?: string; color?: string }> {
  const sb = getAdmin();
  if (!sb) return {};
  try {
    const [{ data: prof }, { data: stats }] = await Promise.all([
      sb.from("profiles").select("frame,color").eq("id", userId).maybeSingle(),
      sb.from("player_stats").select("points").eq("user_id", userId).maybeSingle(),
    ]);
    const level = levelFor((stats as { points: number } | null)?.points ?? 0);
    const out: { frame?: string; color?: string } = {};
    const frame = FRAMES.find((f) => f.id === (prof as { frame?: string } | null)?.frame);
    if (frame && frame.id !== "none" && level >= frame.minLevel) out.frame = frame.id;
    const color = AVATAR_COLORS.find((c) => c.id === (prof as { color?: string } | null)?.color);
    if (color && level >= color.minLevel) out.color = color.id;
    return out;
  } catch {
    return {};
  }
}

// ---- Reports -------------------------------------------------------------

export async function recordReport(r: {
  roomCode: string;
  reporterId: string | null;
  reporterName: string;
  targetId: string | null;
  targetName: string;
  reason: string;
}): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  try {
    await sb.from("reports").insert({
      room_code: r.roomCode,
      reporter_id: r.reporterId,
      reporter_name: r.reporterName,
      target_id: r.targetId,
      target_name: r.targetName,
      reason: r.reason,
    });
  } catch {
    // best-effort
  }
}
