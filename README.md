# WASTELAND SCRAMBLE

A post-apocalyptic 2D multiplayer shooter inspired by the fast-paced action of side-scrolling arena combat, but with a completely unique setting and mechanics.

## Features

- **Grapple Hook Movement** - Zip and swing across ruined landscapes
- **Scrap Weapons** - Nail guns, acid sprayers, pipe rifles, and more
- **Radiation Zones** - Dynamic map hazards that shift gameplay
- **Wall Cling** - Stick to walls for ambushes and strategic positioning
- **Multiple Game Modes** - FFA, Team Scrap, Zone Control, Last Survivor
- **Cross-Platform** - Play on web, Android, and iOS

## Play Online

Play the game online at [your-service.up.railway.app](https://railway.app) once deployed (see Deployment below).

## Deployment (Railway)

Wasteland Scramble is designed to run as a **single Railway service** that serves the
built game **and** the multiplayer (Socket.io) backend on the same HTTPS origin. That
keeps things simple and avoids CORS/port issues.

### One-click deploy

1. Push this repo to GitHub (or keep it there).
2. Go to [railway.app](https://railway.app), log in, and **New Project -> Deploy from
   GitHub repo**, then pick `wasteland-scramble`.
3. Railway reads `railway.json`: it runs `npm run build` (via Nixpacks), then starts the
   server with `node server.mjs`, and health-checks `/`.
4. Once deployed, Railway gives you a public URL like `https://wasteland-scramble.up.railway.app`.
   Open it in a browser — the game loads and the client auto-connects to the multiplayer
   server on that **same origin** (no extra config needed).
5. Share that URL with friends to play together.

`railway.json` handles the build/start. The server reads `process.env.PORT`, which Railway
sets automatically.

### How the client finds the server

The client resolves the server address in this order (see `src/net/serverAddr.js`):

1. **Explicit** URL passed via the registry (`serverAddr`).
2. **`VITE_SERVER_URL`** — set it only if the client and server are split across hosts
   (e.g. client on GitHub Pages + server on Railway).
3. **Local dev** (Vite on a random port) → connects to `localhost:3001`.
4. **Deployed single service** → connects to the same origin that served the page.

For the recommended single-service setup you normally don't set anything.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A modern web browser

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/wasteland-scramble.git
cd wasteland-scramble
npm install
npm run dev
```

Open `http://localhost:8080` in your browser.

### Build

```bash
npm run build
```

Output goes to `dist/` folder.

## Tech Stack

- **Engine**: Phaser 3 (web prototype) -> Godot 4 (mobile builds)
- **Language**: JavaScript / GDScript
- **Networking**: Socket.io (planned)
- **License**: MIT

## Roadmap

- [x] Project setup
- [x] Player movement + grapple hook
- [x] Weapon system
- [x] First map (Junkyard)
- [ ] Bot AI
- [x] Multiplayer
- [ ] Mobile builds (APK + iOS)
- [ ] Additional maps and modes

## Credits

Built with Phaser 3 - https://phaser.io

## License

MIT License - see [LICENSE](LICENSE) for details.
