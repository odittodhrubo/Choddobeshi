# Choddobeshi

Online social-deduction word game. Civilians share a word, the Doppelganger gets a similar word (and doesn't know it), the Chameleon gets none. Give clues, vote, catch the impostors. See [GAME_DESIGN.md](GAME_DESIGN.md) for the full design.

Next.js (App Router) + TypeScript + Socket.IO, all in one Node process.

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000
```

Open 4+ tabs (use separate browser profiles / incognito windows, since tabs share one player id). On a phone over the same Wi-Fi: `http://<your-PC-IP>:3000`.

## Test

```bash
npm test               # game-logic unit tests (Vitest)
```

## Deploy (Railway — one service)

1. Push to GitHub.
2. New Project → Deploy from GitHub repo.
3. Build: `npm run build` · Start: `npm start`.
4. Settings → Networking → Generate Domain.

**Keep exactly 1 replica** — rooms live in server memory. Every redeploy restarts the server and ends games in progress. Works the same on Render / Fly.io. Does **not** work on Vercel (no long-lived server for WebSockets).

## Layout

- `server.ts` — starts Next.js + Socket.IO on one port.
- `src/app`, `src/components` — UI (never import from `src/server`).
- `src/server` — authoritative game engine; `src/server/words/*.json` — word packs.
- `src/shared` — types + Zod schemas shared by both sides.
