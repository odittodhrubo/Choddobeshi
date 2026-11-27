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
} from "../shared/schemas";
import { broadcast, viewFor } from "./game/view";
import {
  startGame,
  submitClue,
  submitAnswer,
  skipDiscussion,
  castVote,
  submitGuess,
  acceptGuess,
  callMeeting,
  playAgain,
  clearTimer,
} from "./game/engine";

const rooms = new Map<string, Room>();
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
    }
  }, EMPTY_ROOM_TTL);
}

interface SocketData {
  code?: string;
  playerId?: string;
}

export function registerHandlers(io: Server, socket: Socket): void {
  const data = socket.data as SocketData;
  const err = (message: string): void => {
    socket.emit("error", { message });
  };

  socket.on("room:create", (payload) => {
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) return err("Invalid name");
    const { name, playerId } = parsed.data;

    const code = genCode();
    const room = newRoom(code);
    const player: Player = {
      id: playerId,
      socketId: socket.id,
      name,
      isHost: true,
      connected: true,
      alive: true,
    };
    room.players.push(player);
    rooms.set(code, room);

    data.code = code;
    data.playerId = playerId;
    socket.join(code);
    socket.emit("room:created", { code });
    socket.emit("state", viewFor(room, playerId));
  });

  socket.on("room:join", (payload) => {
    const parsed = joinSchema.safeParse(payload);
    if (!parsed.success) return err("Invalid join request");
    const { name, playerId } = parsed.data;
    const code = parsed.data.code.toUpperCase();

    const room = rooms.get(code);
    if (!room) return err("Room not found");

    let player = room.players.find((p) => p.id === playerId);
    if (player) {
      // Reconnect / refresh.
      player.socketId = socket.id;
      player.connected = true;
      player.name = name;
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
      };
      room.players.push(player);
    }

    data.code = code;
    data.playerId = playerId;
    socket.join(code);
    reassignHostIfNeeded(room);
    broadcast(io, room);
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

  socket.on("game:start", () => withRoom(true, (room) => startGame(io, room)));

  socket.on("clue:submit", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = clueSchema.safeParse(payload);
      if (!parsed.success) return "Clue must be 1 to 30 characters";
      return submitClue(io, room, player.id, parsed.data.text);
    }),
  );

  socket.on("answer:submit", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = answerSchema.safeParse(payload);
      if (!parsed.success) return "Answer must be 1 to 60 characters";
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
      io.to(room.code).emit("reaction", { from: player.name, emoji: parsed.data.emoji });
    }),
  );

  socket.on("chat:send", (payload) =>
    withRoom(false, (room, player) => {
      const parsed = chatSchema.safeParse(payload);
      if (!parsed.success) return "Message too long";
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
        return;
      }
    }
    reassignHostIfNeeded(room);
    broadcast(io, room);
    if (room.players.every((p) => !p.connected)) scheduleCleanup(io, room);
  });
}
