"use client";
import { io, type Socket } from "socket.io-client";

let authToken: string | null = null;
export function setSocketToken(t: string | null): void {
  authToken = t;
}

// No URL: connects to the same origin that served the page.
// `auth` is a function, so the current token is sent on every (re)connect.
export const socket: Socket = io({
  autoConnect: false,
  path: "/socket.io",
  auth: (cb) => cb({ token: authToken ?? undefined }),
});

/** Stable per-browser player id (survives refresh). */
export function getPlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("playerId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("playerId", id);
  }
  return id;
}

export function getName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("name") ?? "";
}

export function setName(name: string): void {
  localStorage.setItem("name", name);
}
