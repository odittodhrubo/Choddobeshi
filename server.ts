import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { registerHandlers, attachUser, restoreRooms } from "./src/server/rooms";
import { verifyToken, loadExcludedPairs } from "./src/server/supabase";
import { setExcludedPairs } from "./src/server/words";
import { refreshContent } from "./src/server/content";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: "/socket.io",
    // In dev, Next.js runs its own HMR websocket; don't let Socket.IO grab it.
    allowUpgrades: true,
  });

  io.on("connection", (socket) => {
    socket.data.userId = null;
    registerHandlers(io, socket); // sync: never miss the client's immediate room:join

    // Verify the Supabase token (if any) in parallel; backfill once known. Guests allowed.
    const token = socket.handshake.auth?.token as string | undefined;
    void verifyToken(token).then((uid) => {
      socket.data.userId = uid;
      if (uid) attachUser(io, socket, uid);
    });
  });

  void restoreRooms(io); // reload any games that were live before a restart

  // Words and questions come from the database; refresh them on a timer.
  void refreshContent();
  setInterval(() => void refreshContent(), 5 * 60 * 1000).unref();

  // Keep lopsided word pairs out of rotation, using logged balance data.
  const refreshBalance = () => void loadExcludedPairs().then(setExcludedPairs);
  refreshBalance();
  setInterval(refreshBalance, 10 * 60 * 1000).unref();

  httpServer.listen(port, hostname, () => {
    console.log(`> Choddobeshi ready on http://${hostname}:${port} (dev=${dev})`);
  });
});
