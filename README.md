# LILA BLACK — Player Journey Visualizer

Level Designers at LILA Games have 5 days of production gameplay data — ~89,000 events across ~1,700 files — but no way to see what's actually happening on their maps. Where do players go? Where do they fight? Where do they die? Which zones get ignored?

This tool turns that raw telemetry into something a Level Designer can open in their browser and use immediately.

**Live Tool:** https://lila-black-player-visualization.vercel.app/

---

## What Can a Level Designer Do With This?

### See the big picture instantly

Open the tool and immediately see a heatmap of where players walk across the map. No clicks, no setup. Dark areas = dead zones that need design attention.

### Watch a match unfold

Pick any match, press play, and watch players move across the map in real time. See when the first fights break out, where loot gets picked up, and how the match flows from start to finish. Pause at any moment — everything stays visible.

### Compare human vs bot behavior

Toggle human trails (cyan) and bot trails (amber) independently. Are bots patrolling predictably? Are humans avoiding certain zones? Directional arrows on each trail show which way players moved.

### Investigate specific events

Toggle on kill markers, death markers, storm deaths, or loot pickups — each with a unique color and shape. Count badges tell you the volume before you even turn them on. Click any marker (with inspect mode) to see which match and player it belongs to.

### Spot patterns across time

Switch between Feb 10–14 and watch activity change day by day. If trails thin out and match counts drop, that's a retention signal the map might be contributing to.

### Compare all three maps

Switch between AmbroseValley, GrandRift, and Lockdown. Compare heatmaps, kill counts, storm deaths, and loot distribution. Find which map needs the most design attention.

### Zoom into the details

Scroll to zoom into any zone. Drag to pan. The map stays in frame no matter how fast you zoom. Works identically on trackpad and mouse.

For detailed workflows showing how a Level Designer uses this tool — see **[USER_JOURNEYS.md](./USER_JOURNEYS.md)**.

## How It Works (Brief)

A Python script reads ~1,700 parquet files and outputs a single JSON. The React app loads it in the browser. Everything renders on a single HTML canvas with viewport-based zoom. No backend, no database, no API calls.

For the full technical breakdown — coordinate mapping, data flow, bugs I hit, tradeoffs I made — see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

For three data-backed insights about the game — see **[INSIGHTS.md](./INSIGHTS.md)**.

---

## Setup

All data files are included in the repo. No additional data processing needed.

```bash
git clone https://github.com/pragya-20/lila-black-player-visualizer.git
cd lila-black-player-visualizer
npm install
npm run dev
```

Opens at `http://localhost:5173`

### Deploy

```bash
vercel --prod
```

Or connect the repo to [Vercel](https://vercel.com) via GitHub — auto-deploys on every push to `main`.

### Re-processing raw data (optional)

Only needed if you have the original `player_data/` folder and want to regenerate `game_data.json`:

```bash
pip install pandas pyarrow
python3 preprocess.py
```

---

## Tech

|           |                                         |
| --------- | --------------------------------------- |
| Frontend  | React (Vite)                            |
| Rendering | HTML Canvas                             |
| Data      | Pre-processed JSON from Parquet (~27MB) |
| Hosting   | Vercel                                  |

No env vars. No backend. No database.

---

## Project Structure

```
├── public/
│   ├── game_data.json
│   ├── AmbroseValley_Minimap.png
│   ├── GrandRift_Minimap.png
│   └── Lockdown_Minimap.jpg
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── preprocess.py
├── ARCHITECTURE.md
├── INSIGHTS.md
├── USER_JOURNEYS.md
└── README.md
```
