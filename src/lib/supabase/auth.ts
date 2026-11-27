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
    .select("games,wins,civ_wins,imp_wins,guesser_wins,times_civilian,times_impostor,points")
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

/** Upgrade a guest into a Google account (keeps the same user id and stats). */
export async function signInWithGoogle(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${location.origin}` },
  });
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}
