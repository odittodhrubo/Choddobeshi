// AI word/question generation via the Gemini REST API. Server-only.
// Every function returns null on any failure so the caller can fall back to
// the built-in packs — a game must never break because the AI was unavailable.

import { containsProfanity } from "./moderation";

const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.5-flash-lite"];

export const aiEnabled = (): boolean => !!process.env.GEMINI_API_KEY;

interface Schema {
  type: "object";
  properties: Record<string, { type: "string" }>;
  required: string[];
}

async function generate<T>(prompt: string, schema: Schema): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 1.3,
    },
  });

  for (const model of MODELS) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body,
          signal: ctrl.signal,
        },
      );
      clearTimeout(timeout);
      if (!res.ok) continue; // try the next model
      const data = await res.json();
      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const parsed = JSON.parse(text) as T;
      return parsed;
    } catch {
      clearTimeout(timeout);
      // network/abort/parse error — try the next model
    }
  }
  return null;
}

const TOPICS = [
  "food", "animals", "places", "sports", "technology", "nature", "household objects",
  "jobs", "music", "travel", "clothing", "entertainment", "school", "vehicles", "weather",
  "geography and countries", "world cities", "landmarks", "rivers and mountains",
];
const randTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)];

export async function generateWordPair(
  difficulty: "easy" | "medium" | "hard" | "mixed",
  avoid: string[] = [],
): Promise<{ civilian: string; doppelganger: string } | null> {
  const diffHint =
    difficulty === "easy"
      ? "clearly different (easy to tell apart)"
      : difficulty === "hard"
        ? "very similar and easily confused"
        : "related but distinguishable";
  const avoidHint = avoid.length ? ` Avoid these words: ${avoid.slice(-20).join(", ")}.` : "";
  const prompt =
    `Generate ONE word pair for a social-deduction party game, themed around "${randTopic()}". ` +
    `Give two common single-word nouns that are ${diffHint}: a "civilian" word and a "doppelganger" word. ` +
    `They should share some associations but not be identical.${avoidHint} ` +
    `Keep each to one or two words, suitable for all ages.`;
  const pair = await generate<{ civilian: string; doppelganger: string }>(prompt, {
    type: "object",
    properties: { civilian: { type: "string" }, doppelganger: { type: "string" } },
    required: ["civilian", "doppelganger"],
  });
  if (!pair || !pair.civilian?.trim() || !pair.doppelganger?.trim()) return null;
  if (containsProfanity(pair.civilian) || containsProfanity(pair.doppelganger)) return null;
  return { civilian: pair.civilian.trim(), doppelganger: pair.doppelganger.trim() };
}

export async function generateQuestionPair(
  avoid: string[] = [],
): Promise<{ civilian: string; imposter: string } | null> {
  const avoidHint = avoid.length ? ` Avoid questions like: ${avoid.slice(-10).join(" / ")}.` : "";
  const prompt =
    `Generate ONE question pair for a social-deduction party game. ` +
    `Two short, similar everyday prompts where answers overlap but subtly differ: ` +
    `a "civilian" question everyone answers, and an "imposter" question that is a sneaky variation. ` +
    `Example shape: "Name something cold" vs "Name something hot".${avoidHint} ` +
    `Keep each under 8 words, all ages.`;
  const q = await generate<{ civilian: string; imposter: string }>(prompt, {
    type: "object",
    properties: { civilian: { type: "string" }, imposter: { type: "string" } },
    required: ["civilian", "imposter"],
  });
  if (!q || !q.civilian?.trim() || !q.imposter?.trim()) return null;
  if (containsProfanity(q.civilian) || containsProfanity(q.imposter)) return null;
  return { civilian: q.civilian.trim(), imposter: q.imposter.trim() };
}
