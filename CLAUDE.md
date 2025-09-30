# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Sonic vs. The 2008 Crash" is a browser-based side-scrolling runner game created for the AI Prompt & Play competition. The game recreates a Sonic-style platformer with a financial crisis twist: Sonic collects CDOs (collateralized debt obligations) instead of rings, and running out triggers the 2008 financial crash.

The project was built entirely with AI-generated code following competition rules: all functional HTML, CSS, and JavaScript logic was produced through AI prompts (documented in prompts.md).

## Architecture

### Core Files
- **index.html** - Main game markup, HUD, overlays, and message panels
- **script.js** - Complete game engine (~1250 lines)
- **style.css** - Visual styling with cyberpunk/financial theme

### Game Engine Structure (script.js)

**Configuration & State**
- `config` object (lines 15-39): Game constants for physics, speed, penalties, platform sizing
- `state` object (lines 41-56): Runtime state including CDO bank, distance, speed, health, game flags

**Physics & Movement**
- Multi-layer platform system with 3 vertical levels (lines 71-75)
- Gravity-based jumping with hold-boost mechanic (lines 113-119)
- Platform collision resolution (lines 637-665)

**Core Classes**
- `Player` (lines 90-255): Character rendering, animation cycles, physics updates, bounds checking
- `PlatformSegment` (lines 456-560): Multi-layer platforms with distinct visual styles (grass ground vs. elevated neon platforms)
- `Collectible` (lines 257-313): CDO pickups with wave animation
- `Hazard` (lines 315-386): Three types (subprime, short, air) with varied placement
- `FloatingText` (lines 388-411): Damage/collection feedback
- `Particle` (lines 413-439): Dust/impact effects

**Procedural Generation**
- `ensureLevelCoverage()` (lines 598-621): Maintains platform coverage ahead of player
- `spawnSinkhole()` (lines 691-740): Creates ground gaps with elevated bridge platforms
- Difficulty scaling via `getDifficultyScale()` (lines 59-63): Increases spawn rates, hazard density, gap width based on distance

**Game Loop**
- Main loop at lines 1244-1254 with delta-time physics
- `updateGame()` (lines 977-1069): Physics, spawning, collisions, health decay
- `drawGame()` (lines 1110-1147): Parallax background, screen shake, crash flash effects
- Parallax background layers (lines 65-69, 1071-1096)

**Special Mechanics**
- "Big Short" fall event (lines 903-926): Triggered when player falls through gaps, displays overlay, heavy penalties
- Progressive difficulty (lines 59-63, 698-708, 986-997): Hazard spawn rates and gap sizes scale with distance
- Win condition at 20,000m (lines 928-946, 1065-1067)
- Health decay system (lines 1054-1062): Confidence drains over time, accelerating with difficulty

## Running the Game

### Development
1. Open `index.html` directly in a modern browser (Chrome, Firefox, Edge)
2. No build step or dependencies required
3. Game runs entirely client-side with HTML5 Canvas

### Controls
- **Space** or **Up Arrow**: Jump (hold for higher jump)
- **R**: Restart after crash (when game over)

### Game Mechanics
- Start with 28 CDOs and 100% confidence
- Collect glowing CDOs (+3 CDOs, +5m distance, +2% confidence)
- Avoid hazards (subprime/short/hedge): -5 CDOs, -8% confidence each
- Confidence drains passively, faster at higher distances
- Falling through gaps triggers "Big Short" event: -30% confidence, -8 CDOs
- Game over if CDOs or confidence reaches zero
- Win at 20,000m distance

## Competition Context

### Rules Followed
- All code AI-generated (see prompts.md for full prompt log)
- Plain HTML/CSS/JavaScript only
- Game twist: Financial crisis theme replacing traditional Sonic rings/lives
- 2-hour development window

### Prompts Used
See `prompts.md` for complete chronological prompt history. Key prompts:
1. Initial Sonic CDO concept generation (2025-09-16 10:05)
2. Multi-layer platforms and Big Short mechanic (10:20)
3. Difficulty balancing and visual polish (10:35-10:55)

## Theme Details

The game uses a financial crisis metaphor throughout:
- **CDOs** (Collateralized Debt Obligations) replace rings/coins
- **Hazard types**: "SUBPRIME" mortgages (AAA* rated), "SHORT SELLER", "HEDGE" funds
- **HUD labels**: CDOs, Distance, Risk Level (Booming → Toxic), Confidence (replaces health)
- **"Big Short" event**: References the 2008 housing bubble collapse
- **Win/loss messages**: Financial crisis language ("2008 Redux", "Soft Landing", etc.)
- **Visual style**: Dark cyberpunk with neon accents, financial data aesthetic

## Code Quality Notes

- Pure vanilla JavaScript, no frameworks
- Object-oriented design with ES6 class syntax
- Delta-time game loop for consistent physics
- Responsive canvas sizing (lines 1166-1186)
- Collision detection with pixel-perfect bounds (lines 135-142, 271-277, 339-346)
- No external dependencies or assets (all graphics procedurally drawn)