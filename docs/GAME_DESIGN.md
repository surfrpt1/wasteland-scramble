# WASTELAND SCRAMBLE - Game Design Document

## Overview

**Wasteland Scramble** is a post-apocalyptic 2D multiplayer arena shooter. Players control scavengers fighting in ruined landscapes using makeshift weapons, grappling hooks, and environmental tactics.

**Genre**: 2D Side-Scrolling Arena Shooter
**Platforms**: Web (HTML5), Android (APK), iOS
**Players**: 2-6 (online), 1-4 (local LAN)
**Engine**: Phaser 3 (web prototype) → Godot 4 (mobile builds)

## Core Pillars

1. **Fast Movement** - Grapple hooks, wall clinging, and sliding create fluid, skill-based traversal
2. **Scrap Combat** - Makeshift weapons with unique personalities reward creative loadouts
3. **Environmental Danger** - Radiation zones and storms force constant repositioning
4. **Accessible Chaos** - Easy to pick up, hard to master

## What Makes This Different from Mini Militia

| Aspect | Mini Militia | Wasteland Scramble |
|--------|-------------|-------------------|
| Setting | Military/doodle theme | Post-apocalyptic wasteland |
| Movement | Jetpack | Grapple hook + wall cling + slide |
| Characters | Stickman soldiers | Scrappy scavengers with gear |
| Weapons | Military firearms | Scrap-built weapons (nail guns, acid sprayers) |
| Hazards | None | Radiation zones + rad storms |
| Progression | Rank-based | Mid-match scrap crafting |
| Art Style | Cartoon doodle | Gritty pixel art |

## Movement System

### Base Movement
- WASD for horizontal movement
- Space/W for jump
- Movement speed: 250 px/s

### Grapple Hook (Right-Click)
- Fires a grappling line to surfaces within 350px range
- Pulls player toward grapple point at 600 px/s
- 500ms cooldown between uses
- Enables vertical traversal without jetpack
- Can be released early by releasing right-click

### Wall Cling (Q Key)
- Press Q while against a wall in mid-air
- Player clings to wall for up to 1.5 seconds
- Gravity disabled during cling
- Press jump while clinging to leap off wall
- Enables ambush tactics and strategic positioning

### Slide (Shift Key)
- Brief 300ms dash at 400 px/s
- Player becomes semi-transparent (phase visual)
- Must be on ground to initiate
- Useful for dodging and repositioning

## Weapon System

### Scrap Rifle (Default)
- Balanced damage (15), moderate fire rate (300ms)
- Low spread, 30 ammo
- The reliable workhorse

### Nail Gun
- Low damage (8), high fire rate (100ms)
- Wide spread, 60 ammo
- Spray and pray

### Pipe Bomb Launcher
- High damage (50), slow fire rate (1500ms)
- Explosive with 80px radius
- Only 5 ammo - make every shot count

### Acid Sprayer
- Very low damage (5), extreme fire rate (50ms)
- Very wide spread, 100 ammo
- Area denial weapon

## Map: Junkyard

**Size**: 80x30 tiles (2560x960 pixels)

### Layout
- Ground level with scattered cover
- Mid-level platforms connected by grapple routes
- High perches for sniping
- Pipe structures for wall-cling spots
- Two radiation zones in lower areas

### Radiation Zones
- Green-tinted areas that cause damage over time
- Damage increases with exposure duration
- Forces players to move and avoid camping

### Pickups
- Health Packs: Restore 30 HP
- Weapon Pickups: Switch weapon and get full ammo
- Pickups respawn after 15 seconds

## Game Modes

### Practice vs Bots
- 1 human + 3 AI bots
- Learn mechanics at your own pace
- No pressure, pure practice

### Scavenge FFA (Free-For-All)
- 6 players, last one standing or most kills in 5 minutes
- Every player for themselves

### Team Scrap
- 3v3 team deathmatch
- Shared team score
- Coordination wins

### Zone Control
- Capture and hold radiation-free zones
- Points accumulate while holding zones
- First to target score wins

### Last Survivor
- Shrinking radiation zone (battle royale style)
- Last player alive wins

## Bot AI

Bots use simple but effective AI:
1. **Pathfinding**: Move toward nearest player
2. **Combat**: Shoot when within 400px range
3. **Evasion**: Back away when too close
4. **Grapple**: Occasionally grapple to high ground
5. **Difficulty**: Randomized reaction times and accuracy

## Progression (Planned)

- **Scrap Currency**: Earned from kills and match performance
- **Character Customization**: Different scavenger outfits and accessories
- **Weapon Skins**: Cosmetic weapon appearances
- **Titles**: Achievement-based player titles
- **No Pay-to-Win**: All gameplay-affecting items earnable through play

## Art Style

- **Pixel Art**: 16x16 to 32x32 tile size
- **Color Palette**: Desert tones (browns, oranges, dark greens)
- **Radiation**: Bright green accents for danger zones
- **UI**: Dark panels with amber/cream text (wasteland terminal aesthetic)

## Sound Design (Planned)

- **Music**: Ambient desert tracks, intensity increases in combat
- **Weapons**: Distinct scrap-metal sounds per weapon
- **Environment**: Wind, radiation hum, metal creaking
- **UI**: Click/clunk sounds for menu navigation

## Technical Architecture

```
Web Build:     Phaser 3 → Vite → HTML5 Canvas → GitHub Pages
Android Build: Godot 4  → Android Export → APK → GitHub Releases
iOS Build:     Godot 4  → iOS Export → TestFlight → App Store
```

### Networking (Planned)
- **Web**: WebSocket with Node.js server
- **Mobile**: Godot's built-in high-level multiplayer API
- **Peer-to-peer**: For LAN play
- **Dedicated server**: For online play (future)

## Monetization (Future)

- **Free to Play**: Core game always free
- **Cosmetic Shop**: Character skins, weapon skins, emotes
- **Battle Pass**: Seasonal content with free and premium tracks
- **No Lootboxes**: Direct purchase only
