"use client";

// Tiny Web Audio sound effects + haptics. No assets, respects a mute toggle.

let ctx: AudioContext | null = null;
let muted = false;

if (typeof window !== "undefined") {
  muted = localStorage.getItem("muted") === "1";
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(v: boolean): void {
  muted = v;
  if (typeof window !== "undefined") localStorage.setItem("muted", v ? "1" : "0");
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, startMs: number, durMs: number, type: OscillatorType = "sine", gain = 0.12) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + startMs / 1000;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

export type Sfx = "turn" | "vote" | "eject" | "win" | "lose" | "join" | "tick" | "react";

export function play(name: Sfx): void {
  if (muted) return;
  switch (name) {
    case "turn":
      tone(660, 0, 140, "triangle");
      tone(880, 120, 160, "triangle");
      buzz(60);
      break;
    case "vote":
      tone(392, 0, 220, "sawtooth", 0.08);
      tone(330, 180, 260, "sawtooth", 0.08);
      buzz([40, 40, 40]);
      break;
    case "eject":
      tone(300, 0, 140, "square", 0.08);
      tone(200, 150, 260, "square", 0.08);
      break;
    case "win":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 110, 220, "triangle"));
      buzz([80, 40, 80]);
      break;
    case "lose":
      [392, 330, 262].forEach((f, i) => tone(f, i * 150, 300, "sine", 0.1));
      break;
    case "join":
      tone(880, 0, 90, "sine", 0.07);
      break;
    case "tick":
      tone(1200, 0, 50, "sine", 0.05);
      break;
    case "react":
      tone(990, 0, 70, "triangle", 0.06);
      break;
  }
}
