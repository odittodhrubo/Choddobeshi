const CREW = [
  "#ff6eb4", "#7c6cff", "#39d98a", "#ffcf5c", "#59c3ff", "#ff8f5c",
  "#c084fc", "#4be3c0", "#ff5d6c", "#9ae85b", "#f472b6", "#38bdf8",
];

/** Stable colour for a player, derived from their id. */
export const playerColor = (id: string): string =>
  CREW[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % CREW.length];

export const initials = (name: string): string => name.slice(0, 2).toUpperCase();
