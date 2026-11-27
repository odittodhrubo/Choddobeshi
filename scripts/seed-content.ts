// One-time (and safe to repeat) import of the built-in word and question files
// into Supabase. Run with:  npm run seed
//
// Insert-only: rows that already exist are left alone, so any edits you made in
// the database (disabled pairs, changed difficulty, ...) are never overwritten.

import { createClient } from "@supabase/supabase-js";
import en from "../src/server/words/en.json";
import food from "../src/server/words/food.json";
import movies from "../src/server/words/movies.json";
import geography from "../src/server/words/geography.json";
import bn from "../src/server/words/bn.json";
import questions from "../src/server/words/questions.json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

interface JsonPair {
  civilian: string;
  doppelganger: string;
  aliases?: string[];
  difficulty?: string;
}
const PACKS = [
  { file: en, language: "en", sort: 10 },
  { file: food, language: "en", sort: 20 },
  { file: movies, language: "en", sort: 30 },
  { file: geography, language: "en", sort: 40 },
  { file: bn, language: "bn", sort: 50 },
];

const CHUNK = 200;
async function insertChunks(table: string, rows: object[], onConflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function count(table: string, filter?: [string, string]): Promise<number> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (filter) q = q.eq(filter[0], filter[1]);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

async function main(): Promise<void> {
  // Packs first (pairs reference them).
  await insertChunks(
    "word_packs",
    PACKS.map((p) => ({ id: p.file.id, name: p.file.name, language: p.language, sort: p.sort, active: true })),
    "id",
  );

  let words = 0;
  for (const p of PACKS) {
    const rows = (p.file.pairs as JsonPair[]).map((x) => ({
      pack_id: p.file.id,
      civilian: x.civilian,
      doppelganger: x.doppelganger,
      aliases: x.aliases ?? [],
      difficulty: x.difficulty ?? "medium",
      status: "approved",
      source: "curated",
    }));
    await insertChunks("word_pairs", rows, "pack_id,civilian,doppelganger");
    words += rows.length;
  }

  const qRows = (questions.pairs as { civilian: string; imposter: string }[]).map((q) => ({
    civilian: q.civilian,
    imposter: q.imposter,
    status: "approved",
    source: "curated",
  }));
  await insertChunks("question_pairs", qRows, "civilian,imposter");

  console.log(`Seeded from files: ${words} word pairs in ${PACKS.length} packs, ${qRows.length} questions.`);
  console.log(
    `Database now holds: ${await count("word_pairs")} word pairs ` +
      `(${await count("word_pairs", ["status", "pending"])} pending), ` +
      `${await count("question_pairs")} questions ` +
      `(${await count("question_pairs", ["status", "pending"])} pending).`,
  );
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  console.error("Did you run supabase/migrations_v4.sql first?");
  process.exit(1);
});
