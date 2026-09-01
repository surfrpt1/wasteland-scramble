# WASTELAND SCRAMBLE

A post-apocalyptic 2D arena shooter built with Phaser 3 and Socket.io. Fast side-scrolling
combat with a grappling hook, scrap-built weapons, radiation zones, and real-time authoritative
multiplayer. Play it straight in your browser — no download needed.

## Play Online

**Play now:** <https://wasteland-scramble-v2-production.up.railway.app>

## Features

- **Grapple Hook Movement** - Zip and swing across ruined landscapes
- **Scrap Weapons** - Nail guns, acid sprayers, pipe rifles, and more
- **Radiation Zones** - Dynamic map hazards that shift gameplay
- **Wall Cling** - Stick to walls for ambushes and strategic positioning
- **Authoritative Multiplayer** - Host rounds with a kill limit and time limit, player names,
  live kill feed, and match rankings
- **Practice vs Bots** - Hone your skills against AI raiders before going online
- **Local Battle** - Jump straight into an offline FFA match
- **Procedural Audio** - Every sound effect and the menu theme are synthesized on the fly with
  the Web Audio API (no audio files to download); press `M` to mute
- **Cross-Platform** - Desktop and mobile, right in the browser

## Controls

| Action          | Key          |
| --------------- | ------------ |
| Move            | WASD         |
| Aim & Shoot     | Mouse        |
| Reload          | R            |
| Grapple Hook    | Right-click  |
| Jump            | Space        |
| Slide           | Shift        |
| Wall Cling      | Q            |
| Switch Weapon   | 1-4          |
| Toggle Sound    | M            |

## Deployment (Railway)

Wasteland Scramble runs as a **single Railway service** that serves the built game **and** the
Socket.io multiplayer backend on the same HTTPS origin — no CORS or port juggling.

Build/start steps are stored on the service via Railway's IaC config in `.railway/railway.ts`:

- **Build:** `npm run build` (Vite → `dist/`)
- **Start:** `node server.mjs`
- **Healthcheck:** `/`

### Deploying

From the `wasteland-scramble` project directory:

```bash
railway up --detach \
  --project <project-id> \
  --environment production \
  --service wasteland-scramble-v2
```

Railway gives the service a public URL like
`https://wasteland-scramble-v2-production.up.railway.app`; open it, and the client connects to
the multiplayer server on that **same origin** automatically. The server reads
`process.env.PORT`, which Railway sets.

### How the client finds the server

Resolution order (see `src/net/serverAddr.js`):

1. **Explicit** URL passed via the registry (`serverAddr`).
2. **`VITE_SERVER_URL`** — set it only if the client and server are split across hosts
   (e.g. client on GitHub Pages + server on Railway).
3. **Local dev** (Vite on a random port) → connects to `localhost:3001`.
4. **Deployed single service** → connects to the same origin that served the page.

For the recommended single-service setup you don't need to set anything.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A modern web browser

### Setup

```bash
git clone https://github.com/surfrpt1/wasteland-scramble.git
cd wasteland-scramble
npm install
npm run dev
```

Open `http://localhost:8080` in your browser. To test multiplayer locally, also run the server:
`node server.mjs` (listens on `:3001`).

### Build

```bash
npm run build
```

Output goes to the `dist/` folder.

## Tech Stack

- **Engine**: Phaser 3
- **Language**: JavaScript (ES modules)
- **Backend**: Node.js + Socket.io (authoritative game server)
- **Audio**: Procedural Web Audio synthesis
- **Build**: Vite
- **License**: MIT

## Roadmap

- [x] Project setup
- [x] Player movement + grapple hook
- [x] Weapon system
- [x] First map (Junkyard)
- [x] Bot AI (practice mode)
- [x] Multiplayer (rooms, kill limit, time limit, rankings)
- [x] Procedural audio
- [ ] Mobile builds (APK + iOS)
- [ ] Additional maps and modes

## License

MIT License - see [LICENSE](LICENSE) for details.