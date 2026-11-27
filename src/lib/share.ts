"use client";
import type { PlayerView } from "@/shared/types";

/** Draw a square social card summarising the finished game. */
export function makeRecapImage(view: PlayerView): Promise<Blob | null> {
  const { room } = view;
  const S = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  // Background
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, "#141a2b");
  g.addColorStop(1, "#0b0f1a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // Soft brand glow
  const glow = ctx.createRadialGradient(S * 0.2, S * 0.1, 0, S * 0.2, S * 0.1, S * 0.9);
  glow.addColorStop(0, "rgba(124,108,255,0.35)");
  glow.addColorStop(1, "rgba(124,108,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  const center = S / 2;
  ctx.textAlign = "center";

  // Title
  ctx.fillStyle = "#8b95b5";
  ctx.font = "600 42px system-ui, sans-serif";
  ctx.fillText("🎭  CHODDOBESHI", center, 150);

  // Result
  const w = room.winner;
  const result =
    w?.team === "civilians"
      ? ["Civilians win!", "#39d98a"]
      : w?.team === "guesser"
        ? ["Impostor guessed it!", "#ffcf5c"]
        : ["Impostors win!", "#ff5d6c"];
  ctx.fillStyle = result[1];
  ctx.font = "800 96px system-ui, sans-serif";
  ctx.fillText(result[0], center, 310);

  // Mode
  ctx.fillStyle = "#e8ecf7";
  ctx.font = "500 40px system-ui, sans-serif";
  const mode = room.mode === "questions" ? "Questions mode" : "Classic mode";
  ctx.fillText(mode, center, 390);

  // Words / questions card
  ctx.fillStyle = "rgba(29,37,64,0.85)";
  roundRect(ctx, 120, 470, S - 240, 230, 36);
  ctx.fill();

  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillStyle = "#8b95b5";
  ctx.fillText(room.mode === "questions" ? "THE QUESTIONS" : "THE WORDS", center, 540);

  ctx.font = "700 46px system-ui, sans-serif";
  ctx.fillStyle = "#7c6cff";
  wrapText(ctx, room.civilianWord ?? "—", center, 600, S - 320, 52);
  ctx.fillStyle = "#ffcf5c";
  wrapText(ctx, room.doppelgangerWord ?? "—", center, 662, S - 320, 52);

  // Meta
  ctx.fillStyle = "#8b95b5";
  ctx.font = "500 38px system-ui, sans-serif";
  const rounds = room.mode === "questions" ? "1 round" : `${room.round} round${room.round === 1 ? "" : "s"}`;
  ctx.fillText(`${room.players.length} players  ·  ${rounds}`, center, 800);

  // Footer
  ctx.fillStyle = "#5a4cff";
  ctx.font = "700 40px system-ui, sans-serif";
  const host = typeof location !== "undefined" ? location.host : "choddobeshi";
  ctx.fillText(`Play at ${host}`, center, 960);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Share the blob via the native share sheet, or download it as a fallback. */
export async function shareRecap(blob: Blob): Promise<void> {
  const file = new File([blob], "choddobeshi-result.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: "Choddobeshi" });
      return;
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "choddobeshi-result.png";
  a.click();
  URL.revokeObjectURL(url);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  lines.push(line);
  // single line: keep baseline; multi-line is rare for short words/questions
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}
