import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Room } from "../shared/types";

// Room snapshots, so a redeploy/restart doesn't wipe active games.
// All no-ops until the secret key is configured.

let admin: SupabaseClient | null | undefined;
function getAdmin(): SupabaseClient | null {
  if (admin === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    admin = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return admin;
}

export const persistenceEnabled = (): boolean => !!getAdmin();

/** Room without the live timer (not serialisable). */
function serialize(room: Room): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { timer, ...rest } = room;
  return rest;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced upsert of a room's state (500ms). */
export function saveRoom(room: Room): void {
  const sb = getAdmin();
  if (!sb) return;
  const existing = saveTimers.get(room.code);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    room.code,
    setTimeout(() => {
      saveTimers.delete(room.code);
      void sb
        .from("rooms")
        .upsert({ code: room.code, state: serialize(room), updated_at: new Date().toISOString() })
        .then(() => undefined);
    }, 500),
  );
}

export function deleteRoom(code: string): void {
  const sb = getAdmin();
  if (!sb) return;
  const t = saveTimers.get(code);
  if (t) {
    clearTimeout(t);
    saveTimers.delete(code);
  }
  void sb.from("rooms").delete().eq("code", code).then(() => undefined);
}

/** Load all saved rooms on boot. Players are marked disconnected until they rejoin. */
export async function loadAllRooms(): Promise<Room[]> {
  const sb = getAdmin();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("rooms").select("state");
    if (error || !data) return [];
    return data.map((r) => {
      const room = (r as { state: Room }).state;
      room.timer = undefined;
      for (const p of room.players) {
        p.connected = false;
        p.socketId = null;
      }
      return room;
    });
  } catch {
    return [];
  }
}
