import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  role: "civilian" | "impostor";
  won: boolean;
  winTeam: "civilians" | "impostors" | "guesser";
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
}

const ACHIEVEMENT_CHECKS: Record<string, (s: StatRow) => boolean> = {
  first_game: (s) => s.games >= 1,
  veteran: (s) => s.games >= 10,
  winner: (s) => s.wins >= 5,
  impostor: (s) => s.imp_wins >= 5,
  detective: (s) => s.civ_wins >= 10,
  guesser: (s) => s.guesser_wins >= 1,
  century: (s) => s.points >= 100,
};

async function awardAchievements(sb: SupabaseClient, userId: string): Promise<void> {
  const { data: stats } = await sb
    .from("player_stats")
    .select("games,wins,imp_wins,civ_wins,guesser_wins,points")
    .eq("user_id", userId)
    .maybeSingle();
  if (!stats) return;

  const earned = Object.entries(ACHIEVEMENT_CHECKS)
    .filter(([, check]) => check(stats as StatRow))
    .map(([id]) => ({ user_id: userId, achievement: id }));
  if (earned.length) {
    await sb.from("user_achievements").upsert(earned, { onConflict: "user_id,achievement", ignoreDuplicates: true });
  }
}
