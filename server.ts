import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { registerHandlers } from "./src/server/rooms";

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

  io.on("connection", (socket) => registerHandlers(io, socket));

  httpServer.listen(port, hostname, () => {
    console.log(`> Choddobeshi ready on http://${hostname}:${port} (dev=${dev})`);
  });
});
