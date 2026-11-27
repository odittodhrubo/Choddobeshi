"use client";
import { supabase } from "./client";

export interface Stats {
  games: number;
  wins: number;
  civ_wins: number;
  imp_wins: number;
  guesser_wins: number;
  times_civilian: number;
  times_impostor: number;
  points: number;
  streak_days: number;
  best_streak: number;
  last_played: string | null;
}

/** Ensure the visitor has a session: sign in as an anonymous guest if needed. */
export async function ensureSession(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error) return null; // anonymous sign-ins may be disabled in the project
  return anon.user?.id ?? null;
}

/** Current access token, to hand the realtime server on connect. */
export async function accessToken(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getUsername(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data } = await sb.from("profiles").select("username").eq("id", u.user.id).maybeSingle();
  return data?.username ?? null;
}

export async function saveUsername(username: string): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  await sb.from("profiles").upsert({ id: u.user.id, username });
}

export async function getMyStats(): Promise<Stats | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data } = await sb
    .from("player_stats")
    .select("games,wins,civ_wins,imp_wins,guesser_wins,times_civilian,times_impostor,points,streak_days,best_streak,last_played")
    .eq("user_id", u.user.id)
    .maybeSingle();
  return (data as Stats) ?? null;
}

export async function getMyAchievements(): Promise<string[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data } = await sb.from("user_achievements").select("achievement").eq("user_id", u.user.id);
  return (data ?? []).map((r) => (r as { achievement: string }).achievement);
}

export async function isGuest(): Promise<boolean> {
  const sb = supabase();
  if (!sb) return true;
  const { data } = await sb.auth.getUser();
  return !data.user?.email;
}

/** Sign in with Google. For a guest, link the identity so the same user id
 *  (and its stats) carries over; otherwise a normal OAuth sign-in. */
export async function signInWithGoogle(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const opts = { redirectTo: `${location.origin}` };

  if (await isGuest()) {
    const { error } = await sb.auth.linkIdentity({ provider: "google", options: opts });
    if (!error) return; // redirecting to Google, stats preserved
    // Manual linking may be disabled — fall back to a fresh OAuth sign-in.
  }
  await sb.auth.signInWithOAuth({ provider: "google", options: opts });
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

// ---- Friends, cosmetics, leaderboards -------------------------------------

export interface MyProfile {
  friend_code: string | null;
  frame: string;
  color: string | null;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data } = await sb
    .from("profiles")
    .select("friend_code,frame,color")
    .eq("id", u.user.id)
    .maybeSingle();
  return (data as MyProfile) ?? null;
}

export async function saveCosmetics(frame: string, color: string | null): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  await sb.from("profiles").update({ frame, color }).eq("id", u.user.id);
}

export interface Friend {
  id: string;
  username: string | null;
  points: number;
  wins: number;
  games: number;
}

export async function listFriends(): Promise<Friend[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data: rows } = await sb.from("friendships").select("friend_id");
  const ids = (rows ?? []).map((r) => (r as { friend_id: string }).friend_id);
  if (ids.length === 0) return [];
  const [{ data: profs }, { data: stats }] = await Promise.all([
    sb.from("profiles").select("id,username").in("id", ids),
    sb.from("player_stats").select("user_id,points,wins,games").in("user_id", ids),
  ]);
  return ids.map((id) => {
    const p = (profs ?? []).find((x) => (x as { id: string }).id === id) as { username: string | null } | undefined;
    const st = (stats ?? []).find((x) => (x as { user_id: string }).user_id === id) as
      | { points: number; wins: number; games: number }
      | undefined;
    return { id, username: p?.username ?? null, points: st?.points ?? 0, wins: st?.wins ?? 0, games: st?.games ?? 0 };
  });
}

export type AddFriendResult = "ok" | "not_found" | "self" | "error";

export async function addFriendByCode(code: string): Promise<AddFriendResult> {
  const sb = supabase();
  if (!sb) return "error";
  const { data, error } = await sb.rpc("add_friend_by_code", { p_code: code });
  if (error) return "error";
  return (data as AddFriendResult) ?? "error";
}

export async function removeFriend(id: string): Promise<void> {
  await supabase()?.rpc("remove_friend", { p_friend: id });
}

export interface BoardRow {
  user_id: string;
  username: string | null;
  points: number;
  wins: number;
  games: number;
}

export async function getBoard(kind: "all" | "week"): Promise<BoardRow[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data } = await sb
    .from(kind === "week" ? "weekly_leaderboard" : "leaderboard")
    .select("user_id,username,points,wins,games");
  return (data as BoardRow[]) ?? [];
}

/** Me + my friends, ranked by lifetime points. */
export async function getFriendsBoard(): Promise<BoardRow[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const friends = await listFriends();
  const ids = [u.user.id, ...friends.map((f) => f.id)];
  const [{ data: profs }, { data: stats }] = await Promise.all([
    sb.from("profiles").select("id,username").in("id", ids),
    sb.from("player_stats").select("user_id,points,wins,games").in("user_id", ids),
  ]);
  return ids
    .map((id) => {
      const p = (profs ?? []).find((x) => (x as { id: string }).id === id) as { username: string | null } | undefined;
      const st = (stats ?? []).find((x) => (x as { user_id: string }).user_id === id) as
        | { points: number; wins: number; games: number }
        | undefined;
      return { user_id: id, username: p?.username ?? null, points: st?.points ?? 0, wins: st?.wins ?? 0, games: st?.games ?? 0 };
    })
    .sort((a, b) => b.points - a.points);
}
