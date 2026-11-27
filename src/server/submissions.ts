import { z } from "zod";
import { adminClient, verifyToken } from "./supabase";
import { containsProfanity } from "./moderation";

// Player-suggested words and questions. They enter as "pending" and only reach
// games after you approve them in the Supabase Table Editor.

const DAILY_LIMIT = 10;

const word = z.string().trim().min(1).max(30);
const sentence = z.string().trim().min(5).max(90);
const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("word"), pack: z.string().min(1).max(40), civilian: word, doppelganger: word }),
  z.object({ kind: z.literal("question"), civilian: sentence, imposter: sentence }),
]);

export type SubmitResult = { ok: true } | { ok: false; status: number; error: string };

export async function submitContent(token: string | undefined, raw: unknown): Promise<SubmitResult> {
  const userId = await verifyToken(token);
  if (!userId) return { ok: false, status: 401, error: "Please sign in (guest is fine) and try again." };

  const sb = adminClient();
  if (!sb) return { ok: false, status: 503, error: "Submissions are not available right now." };

  const parsed = body.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: "Check the lengths: words 1 to 30 characters, questions 5 to 90." };
  const b = parsed.data;

  const a = b.civilian;
  const c = b.kind === "word" ? b.doppelganger : b.imposter;
  if (norm(a) === norm(c)) return { ok: false, status: 400, error: "The two entries must be different." };
  if (containsProfanity(a) || containsProfanity(c)) {
    return { ok: false, status: 400, error: "Please keep it clean." };
  }

  const table = b.kind === "word" ? "word_pairs" : "question_pairs";

  // Daily cap per user, counted from the database so it works across restarts.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("submitted_by", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return { ok: false, status: 429, error: `You can suggest up to ${DAILY_LIMIT} per day. Come back tomorrow!` };
  }

  if (b.kind === "word") {
    // The pack must be a real, playable pack.
    const { data: pack } = await sb.from("word_packs").select("id").eq("id", b.pack).eq("active", true).maybeSingle();
    if (!pack) return { ok: false, status: 400, error: "Unknown pack." };
  }

  const row: Record<string, unknown> =
    b.kind === "word"
      ? { pack_id: b.pack, civilian: a, doppelganger: c, status: "pending", source: "player", submitted_by: userId }
      : { civilian: a, imposter: c, status: "pending", source: "player", submitted_by: userId };

  const { error } = await sb.from(table).insert(row);
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, error: "Someone already suggested that one." };
    return { ok: false, status: 500, error: "Could not save your suggestion." };
  }
  return { ok: true };
}
