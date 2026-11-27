import { z } from "zod";

export const nameSchema = z.string().trim().min(1).max(16);

export const createSchema = z.object({
  name: nameSchema,
  playerId: z.string().uuid(),
});

export const joinSchema = z.object({
  code: z.string().trim().length(4),
  name: nameSchema,
  playerId: z.string().uuid(),
});

export const settingsSchema = z
  .object({
    clueSeconds: z.number().int().min(10).max(120),
    discussionSeconds: z.number().int().min(0).max(300),
    voteSeconds: z.number().int().min(10).max(120),
    guessSeconds: z.number().int().min(10).max(120),
    maxRounds: z.number().int().min(6).max(20),
    revealRoleOnEject: z.boolean(),
    doppelgangers: z.union([z.number().int().min(0).max(3), z.literal("auto")]),
    chameleons: z.union([z.number().int().min(0).max(3), z.literal("auto")]),
    wordPack: z.string().min(1).max(40),
    difficulty: z.enum(["easy", "medium", "hard", "mixed"]),
    mode: z.enum(["classic", "questions"]),
    customWord: z
      .object({ civilian: z.string().trim().min(1).max(30), doppelganger: z.string().trim().min(1).max(30) })
      .nullable(),
    customQuestion: z
      .object({ civilian: z.string().trim().min(1).max(80), imposter: z.string().trim().min(1).max(80) })
      .nullable(),
    scoreCivilian: z.number().int().min(0).max(20),
    scoreImpostor: z.number().int().min(0).max(20),
    scoreGuesser: z.number().int().min(0).max(20),
  })
  .partial();

export const clueSchema = z.object({ text: z.string().trim().min(1).max(30) });
export const answerSchema = z.object({ text: z.string().trim().min(1).max(60) });
export const voteSchema = z.object({ target: z.string().min(1).max(64) });
export const guessSchema = z.object({ text: z.string().trim().min(1).max(40) });
export const chatSchema = z.object({ text: z.string().trim().min(1).max(200) });
export const kickSchema = z.object({ target: z.string().min(1).max(64) });
export const reactSchema = z.object({ emoji: z.enum(["🤔", "😂", "🚩", "👀", "🔥", "❤️"]) });
