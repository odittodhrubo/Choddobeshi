import en from "./words/en.json";
import food from "./words/food.json";
import movies from "./words/movies.json";
import geography from "./words/geography.json";
import bn from "./words/bn.json";
import questionsJson from "./words/questions.json";
import { adminClient } from "./supabase";

// Words and questions: the database is the source of truth. The server keeps a
// copy in memory (refreshed on a timer) so games never wait on a query. The
// built-in JSON files are the fallback, used when the database is unreachable,
// not set up yet, or empty. A game must never fail because of content loading.

export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export interface Pair {
  civilian: string;
  doppelganger: string;
  aliases: string[];
  difficulty?: Difficulty;
}
export interface Pack {
  id: string;
  name: string;
  pairs: Pair[];
}
export interface QuestionPair {
  civilian: string;
  imposter: string;
}

const BUILTIN_PACKS = [en, food, movies, geography, bn] as unknown as Pack[];
const BUILTIN_QUESTIONS = (questionsJson as { pairs: QuestionPair[] }).pairs;

let packs: Pack[] = BUILTIN_PACKS;
let questions: QuestionPair[] = BUILTIN_QUESTIONS;
let source: "database" | "builtin" = "builtin";

export const getPacks = (): Pack[] => packs;
export const getPack = (id: string): Pack | undefined => packs.find((p) => p.id === id);
export const getQuestions = (): QuestionPair[] => questions;
export const contentSource = (): "database" | "builtin" => source;
export const contentCounts = (): { packs: number; words: number; questions: number } => ({
  packs: packs.length,
  words: packs.reduce((n, p) => n + p.pairs.length, 0),
  questions: questions.length,
});

// Supabase returns at most 1000 rows per request, so read in pages.
const PAGE = 1000;
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error || !data) return null;
    out.push(...(data as T[]));
    if (data.length < PAGE) return out;
  }
}

interface PackRow {
  id: string;
  name: string;
}
interface PairRow {
  pack_id: string;
  civilian: string;
  doppelganger: string;
  aliases: string[] | null;
  difficulty: "easy" | "medium" | "hard";
}

/** Reload content from the database. Keeps the current content on any problem. */
export async function refreshContent(): Promise<void> {
  const sb = adminClient();
  if (!sb) return;
  try {
    const [packRows, pairRows, questionRows] = await Promise.all([
      fetchAll<PackRow>((a, b) =>
        sb.from("word_packs").select("id,name").eq("active", true).order("sort").order("id").range(a, b),
      ),
      fetchAll<PairRow>((a, b) =>
        sb
          .from("word_pairs")
          .select("pack_id,civilian,doppelganger,aliases,difficulty")
          .eq("active", true)
          .eq("status", "approved")
          .order("id")
          .range(a, b),
      ),
      fetchAll<QuestionPair>((a, b) =>
        sb
          .from("question_pairs")
          .select("civilian,imposter")
          .eq("active", true)
          .eq("status", "approved")
          .order("id")
          .range(a, b),
      ),
    ]);

    let loaded = false;
    if (packRows && pairRows && pairRows.length > 0) {
      const byPack = new Map<string, Pair[]>();
      for (const r of pairRows) {
        const list = byPack.get(r.pack_id) ?? [];
        list.push({
          civilian: r.civilian,
          doppelganger: r.doppelganger,
          aliases: r.aliases ?? [],
          difficulty: r.difficulty,
        });
        byPack.set(r.pack_id, list);
      }
      const built = packRows
        .map((p) => ({ id: p.id, name: p.name, pairs: byPack.get(p.id) ?? [] }))
        .filter((p) => p.pairs.length > 0);
      if (built.length > 0) {
        packs = built;
        loaded = true;
      }
    }
    if (questionRows && questionRows.length > 0) {
      questions = questionRows;
      loaded = true;
    }
    if (loaded && source !== "database") {
      source = "database";
      const c = contentCounts();
      console.log(`> Content loaded from the database: ${c.words} word pairs in ${c.packs} packs, ${c.questions} questions`);
    }
  } catch {
    // keep whatever we already have
  }
}

// ---- AI suggestions ---------------------------------------------------------
// Pairs the AI generated during a game are kept for review. They are inserted as
// "pending" in an inactive holding pack, so they never reach players until you
// approve them in the Table Editor.

export async function saveAiWordPair(p: { civilian: string; doppelganger: string }): Promise<void> {
  const sb = adminClient();
  if (!sb) return;
  try {
    await sb
      .from("word_pairs")
      .upsert(
        {
          pack_id: "ai-suggested",
          civilian: p.civilian.slice(0, 40),
          doppelganger: p.doppelganger.slice(0, 40),
          status: "pending",
          source: "ai",
        },
        { onConflict: "pack_id,civilian,doppelganger", ignoreDuplicates: true },
      );
  } catch {
    // best-effort
  }
}

export async function saveAiQuestionPair(q: QuestionPair): Promise<void> {
  const sb = adminClient();
  if (!sb) return;
  try {
    await sb
      .from("question_pairs")
      .upsert(
        { civilian: q.civilian.slice(0, 100), imposter: q.imposter.slice(0, 100), status: "pending", source: "ai" },
        { onConflict: "civilian,imposter", ignoreDuplicates: true },
      );
  } catch {
    // best-effort
  }
}
