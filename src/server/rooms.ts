import type { Server, Socket } from "socket.io";
import type { ChatMsg, Player, Room, Settings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import {
  createSchema,
  joinSchema,
  settingsSchema,
  clueSchema,
  answerSchema,
  voteSchema,
  guessSchema,
  chatSchema,
  kickSchema,
  reactSchema,
  targetSchema,
  reportSchema,
} from "../shared/schemas";
import { broadcast, viewFor } from "./game/view";
import { containsProfanity, makeRateLimiter } from "./moderation";
import { loadAllRooms, deleteRoom } from "./persistence";
import { resume } from "./game/engine";
import { loadCosmetics, recordReport } from "./supabase";
import {
  startGame,
  submitClue,
  submitAnswer,
  skipDiscussion,
  castVote,
  submitGuess,
  acceptGuess,
  callMeeting,
  setReady,
  skipTurn,
  skipAnswerWait,
  detectivePeek,
  playAgain,
  clearTimer,
} from "./game/engine";

const rooms = new Map<string, Room>();
const startingCodes = new Set<string>(); // rooms mid-AI-generation, to block double-start
const EMPTY_ROOM_TTL = 10 * 60 * 1000; // delete 10 min after everyone leaves

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O, 1/I
function genCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function newRoom(code: string): Room {
  return {
    code,
    players: [],
    settings: { ...DEFAULT_SETTINGS },
    phase: "LOBBY",
    phaseEndsAt: null,
    round: 0,
    civilianWord: "",
    doppelgangerWord: "",
    aliases: [],
    turnOrder: [],
    turnIndex: 0,
    clues: [],
    answers: {},
    votes: {},
    lastEliminated: null,
    guesserId: null,
    winner: null,
    usedPairs: [],
    scores: {},
    gamesPlayed: 0,
    emergencyUsedBy: [],
    voteLog: [],
    aiRecent: [],
    answerHistory: [],
    ready: [],
    muted: [],
    bans: [],
    peeks: {},
    pairKey: null,
    reports: [],
  };
}

function reassignHostIfNeeded(room: Room): void {
  if (room.players.some((p) => p.isHost && p.connected)) return;
  const next = room.players.find((p) => p.connected) ?? room.players[0];
  room.players.forEach((p) => (p.isHost = p === next));
}

function scheduleCleanup(io: Server, room: Room): void {
  setTimeout(() => {
    const r = rooms.get(room.code);
    if (r && r.players.every((p) => !p.connected)) {
      clearTimer(r);
      rooms.delete(room.code);
      deleteRoom(room.code);
    }
  }, EMPTY_ROOM_TTL);
}

interface SocketData {
  code?: string;
  playerId?: string;
  userId?: string | null;
}

/** Reload persisted rooms on server boot and re-arm their timers. */
export async function restoreRooms(io: Server): Promise<void> {
  const saved = await loadAllRooms();
  for (const room of saved) {
    rooms.set(room.code, room);
    resume(io, room); // catch up any phase whose deadline passed while down
    scheduleCleanup(io, room); // delete if nobody rejoins within the TTL
  }
  if (saved.length) console.log(`> Restored ${saved.length} room(s) from the database`);
}

/** Load a signed-in player's unlocked frame/colour and show it to the room. */
function applyCosmetics(io: Server, room: Room, player: Player): void {
  if (!player.userId) return;
  void loadCosmetics(player.userId).then((c) => {
    if (c.frame === player.frame && c.color === player.color) return;
    player.frame = c.frame;
    player.color = c.color;
    broadcast(io, room);
  });
}

/** Backfill a player's auth user id once token verification completes. */
export function attachUser(io: Server, socket: Socket, userId: string): void {
  const d = socket.data as SocketData;
  const room = d.code ? rooms.get(d.code) : undefined;
  const player = room?.players.find((p) => p.id === d.playerId);
  if (!room || !player) return;
  player.userId = userId;

  // A banned account can't sneak in just because its token verified late.
  if (room.bans.includes(userId)) {
    socket.emit("kicked");
    room.players = room.players.filter((p) => p.id !== player.id);
    broadcast(io, room);
    return;
  }
  applyCosmetics(io, room, player);
}

export function registerHandlers(io: Server, socket: Socket): void {
  const data = socket.data as SocketData;
  const err = (message: string): void => {
    socket.emit("error", { message });
  };

  // 30 events / 5s per socket: well above normal play, blocks floods.
  const allow = makeRateLimiter(30, 5000);
  const original = socket.on.bind(socket);
  socket.on = ((event: string, handler: (...a: unknown[]) => void) => {
    if (event === "disconnect") return original(event, handler);
    return original(event, (...args: unknown[]) => {
      if (!allow()) return err("Slow down");
      handler(...args);
    });
  }) as typeof socket.on;

  // Chat and reactions get their own, stricter budgets on top of the global one.
  const chatAllow = makeRateLimiter(5, 10_000);
  const reactAllow = makeRateLimiter(10, 5_000);

  socket.on("room:create", (payload) => {
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) return err("Invalid name");
    const { name, playerId } = parsed.data;
    if (containsProfanity(name)) return err("Please choose a cleaner name");

    const code = genCode();
    const room = newRoom(code);
    const player: Player = {
      id: playerId,
      socketId: socket.id,
      name,
      isHost: true,
      connected: true,
      alive: true,
      userId: data.userId ?? null,
    };
    room.players.push(player);
    rooms.set(code, room);

    data.code = code;
    data.playerId = playerId;
    socket.join(code);
    socket.emit("room:created", { code });
    socket.emit("state", viewFor(room, playerId));
    applyCosmetics(io, room, player);
  });

  socket.on("room:join", (payload) => {
    const parsed = joinSchema.safeParse(payload);
    if (!parsed.success) return err("Invalid join request");
    const { name, playerId } = parsed.data;
    if (containsProfanity(name)) return err("Please choose a cleaner name");
    const code = parsed.data.code.toUpperCase();

    const room = rooms.get(code);
    if (!room) return err("Room not found");
    if (room.bans.includes(playerId) || (data.userId && room.bans.includes(data.userId)))
      return err("You were removed from this room");

    let player = room.players.find((p) => p.id === playerId);
    if (player) {
      // Reconnect / refresh.
      player.socketId = socket.id;
      player.connected = true;
      player.name = name;
      if (data.userId) player.userId = data.userId;
    } else {
      if (room.phase !== "LOBBY") return err("Game already in progress");
      if (room.players.length >= 12) return err("Room is full");
      player = {
        id: playerId,
        socketId: socket.id,
        name,
        isHost: room.players.length === 0,
        connected: true,
        alive: true,
        userId: data.userId ?? null,
      };
      room.players.push(player);
    }

    data.code = code;
    data.playerId = playerId;
    socket.join(code);
    reassignHostIfNeeded(room);
    broadcast(io, room);
    applyCosmetics(io, room, player);
  });

  function withRoom(
    hostOnly: boolean,
    fn: (room: Room, player: Player) => string | null | void,
  ): void {
    const room = data.code ? rooms.get(data.code) : undefined;
    if (!room || !data.playerId) return err("Not in a room");
    const player = room.players.find((p) => p.id === data.playerId);
    if (!player) return err("Not in a room");
    if (hostOnly && !player.isHost) return err("Host only");
    const message = fn(room, player);
    if (message) err(message);
  }

  socket.on("room:settings", (payload) =>
    withRoom(true, (room) => {
      if (room.phase !== "LOBBY") return "Can only change settings in the lobby";
      const parsed = settingsSchema.safeParse(payload);
      if (!parsed.success) return "Invalid settings";
      room.settings = { ...room.settings, ...(parsed.data as Partial<Settings>) };
      broadcast(io, room);
    }),
  );

  socket.on("game:start", () =>
    withRoom(true, (room) => {
      if (startingCodes.has(room.code)) return "Starting…";
      startingCodes.add(room.code);
      void startGame(io, room)
        .then((msg) => {
          if (msg) err(msg);
        })
        .finally(() => startingCodes.delete(room.code));
    }),
  );

  socket.on("clue:submit", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = clueSchema.safeParse(payload);
      if (!parsed.success) return "Clue must be 1 to 30 characters";
      if (containsProfanity(parsed.data.text)) return "Keep clues clean";
      return submitClue(io, room, player.id, parsed.data.text);
    }),
  );

  socket.on("answer:submit", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = answerSchema.safeParse(payload);
      if (!parsed.success) return "Answer must be 1 to 60 characters";
      if (containsProfanity(parsed.data.text)) return "Keep answers clean";
      return submitAnswer(io, room, player.id, parsed.data.text);
    }),
  );

  socket.on("discussion:skip", () =>
    withRoom(true, (room) => skipDiscussion(io, room, true)),
  );

  socket.on("vote:cast", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = voteSchema.safeParse(payload);
      if (!parsed.success) return "Invalid vote";
      return castVote(io, room, player.id, parsed.data.target);
    }),
  );

  socket.on("guess:submit", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = guessSchema.safeParse(payload);
      if (!parsed.success) return "Guess must be 1 to 40 characters";
      return submitGuess(io, room, player.id, parsed.data.text);
    }),
  );

  socket.on("guess:accept", () =>
    withRoom(true, (room) => acceptGuess(io, room, true)),
  );

  socket.on("game:again", () => withRoom(true, (room) => playAgain(io, room)));

  socket.on("room:close", () =>
    withRoom(true, (room) => {
      clearTimer(room);
      io.to(room.code).emit("closed");
      rooms.delete(room.code);
      deleteRoom(room.code);
    }),
  );

  socket.on("meeting:call", () =>
    withRoom(false, (room, player) => callMeeting(io, room, player.id)),
  );

  socket.on("player:kick", (payload) =>
    withRoom(true, (room, host) => {
      if (room.phase !== "LOBBY") return "Can only kick in the lobby";
      const parsed = kickSchema.safeParse(payload);
      if (!parsed.success) return "Invalid kick";
      if (parsed.data.target === host.id) return "You cannot kick yourself";
      const target = room.players.find((p) => p.id === parsed.data.target);
      if (!target) return "Player not found";
      if (target.socketId) io.to(target.socketId).emit("kicked");
      room.players = room.players.filter((p) => p.id !== target.id);
      reassignHostIfNeeded(room);
      broadcast(io, room);
    }),
  );

  socket.on("react", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = reactSchema.safeParse(payload);
      if (!parsed.success) return "Invalid reaction";
      if (room.muted.includes(player.id)) return "The host has muted you";
      if (!reactAllow()) return "Too many reactions";
      io.to(room.code).emit("reaction", { from: player.name, emoji: parsed.data.emoji });
    }),
  );

  socket.on("chat:send", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = chatSchema.safeParse(payload);
      if (!parsed.success) return "Message too long";
      if (room.muted.includes(player.id)) return "The host has muted you";
      if (!chatAllow()) return "You are sending messages too fast";
      if (containsProfanity(parsed.data.text)) return "Keep chat clean";
      const ghost = !player.alive && room.phase !== "GAME_OVER";
      const msg: ChatMsg = { from: player.name, text: parsed.data.text, ghost };
      // Ghost messages go only to other ghosts; living chat goes to everyone.
      for (const p of room.players) {
        if (!p.socketId) continue;
        if (ghost && p.alive && room.phase !== "GAME_OVER") continue;
        io.to(p.socketId).emit("chat", msg);
      }
    }),
  );

  // ---- Pacing -----------------------------------------------------------
  socket.on("ready:set", () => withRoom(false, (room, player) => setReady(io, room, player.id)));
  socket.on("turn:skip", () => withRoom(true, (room) => skipTurn(io, room)));
  socket.on("answer:skip", () => withRoom(true, (room) => skipAnswerWait(io, room)));

  // ---- Detective --------------------------------------------------------
  socket.on("detective:peek", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = targetSchema.safeParse(payload);
      if (!parsed.success) return "Invalid target";
      return detectivePeek(io, room, player.id, parsed.data.target).error ?? null;
    }),
  );

  // ---- Host moderation --------------------------------------------------
  socket.on("player:mute", (payload) =>
    withRoom(true, (room, host) => {
      const parsed = targetSchema.safeParse(payload);
      if (!parsed.success) return "Invalid target";
      const t = room.players.find((p) => p.id === parsed.data.target);
      if (!t || t.id === host.id) return "Pick another player";
      room.muted = room.muted.includes(t.id) ? room.muted.filter((x) => x !== t.id) : [...room.muted, t.id];
      broadcast(io, room);
    }),
  );

  socket.on("player:ban", (payload) =>
    withRoom(true, (room, host) => {
      if (room.phase !== "LOBBY") return "Can only remove players in the lobby";
      const parsed = targetSchema.safeParse(payload);
      if (!parsed.success) return "Invalid target";
      const t = room.players.find((p) => p.id === parsed.data.target);
      if (!t || t.id === host.id) return "Pick another player";
      room.bans.push(t.id);
      if (t.userId) room.bans.push(t.userId);
      if (t.socketId) io.to(t.socketId).emit("kicked");
      room.players = room.players.filter((p) => p.id !== t.id);
      reassignHostIfNeeded(room);
      broadcast(io, room);
    }),
  );

  // ---- Reports ----------------------------------------------------------
  socket.on("player:report", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = reportSchema.safeParse(payload);
      if (!parsed.success) return "Invalid report";
      const t = room.players.find((p) => p.id === parsed.data.target);
      if (!t || t.id === player.id) return "Pick another player";
      const key = `${player.id}:${t.id}`;
      if (room.reports.includes(key)) return "You already reported this player";
      room.reports.push(key);
      void recordReport({
        roomCode: room.code,
        reporterId: player.userId ?? null,
        reporterName: player.name,
        targetId: t.userId ?? null,
        targetName: t.name,
        reason: parsed.data.reason,
      });
      socket.emit("notice", { message: "Report sent. Thank you." });
    }),
  );

  socket.on("disconnect", () => {
    const room = data.code ? rooms.get(data.code) : undefined;
    if (!room || !data.playerId) return;
    const player = room.players.find((p) => p.id === data.playerId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;

    // In the lobby a leaver is removed outright; mid-game they stay as a ghost slot.
    if (room.phase === "LOBBY") {
      room.players = room.players.filter((p) => p.id !== player.id);
      if (room.players.length === 0) {
        clearTimer(room);
        rooms.delete(room.code);
        deleteRoom(room.code);
        return;
      }
    }
    reassignHostIfNeeded(room);
    broadcast(io, room);
    if (room.players.every((p) => !p.connected)) scheduleCleanup(io, room);
  });
}
