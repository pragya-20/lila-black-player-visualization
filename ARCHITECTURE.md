# Architecture

## What I Built With and Why

| Decision  | Choice                     | Why                                                                                                                                                                                                            |
| --------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | React (Vite)               | Considered Streamlit (handles parquet natively), but playback animation would feel laggy. A Level Designer uses this tool frequently — lag kills the experience. React gave me frame-level control.            |
| Rendering | Single HTML Canvas         | The tool renders thousands of elements simultaneously — trails, arrows, heatmap blobs, markers, icons — with zoom/pan. DOM/SVG would choke at this volume. Canvas handles it in one draw pass.                 |
| Data      | Pre-processed JSON (27MB)  | Python script reads ~1,700 parquet files → single static JSON. Browser loads once. No backend, no database, no API calls. At this scale (~89K events), a backend adds latency and complexity for zero benefit. |
| Zoom      | Viewport-based canvas zoom | Tried CSS `transform: scale()` first — map jumped off-frame on trackpad scroll. Viewport approach (`ctx.scale` + `ctx.translate`) with clamped pan means the map never leaves the frame.                       |
| Styling   | Inline React styles        | Tradeoff for 5-day timeline. No hover states or media queries. For production, I'd migrate to Tailwind.                                                                                                        |
| Hosting   | Vercel                     | Zero-config for Vite apps. Push to GitHub, auto-deploys.                                                                                                                                                       |

---

## Data Flow

```
~1,700 .nakama-0 parquet files (organized by date folders)
    │
    ▼
preprocess.py (Python + PyArrow)
    - Reads each file, decodes event column from bytes to UTF-8
    - Detects bots (numeric user_id) vs humans (UUID user_id)
    - Extracts date from folder name (February_10 → 2026-02-10)
    - Combines into single sorted array
    │
    ▼
public/game_data.json (~27MB)
    - events[]: { uid, mid, map, x, y, z, ts, evt, date, bot }
    - matches[]: { id, map, date, humans, bots }
    - dates[]: ["2026-02-10", ...]
    │
    ▼
React app (browser)
    - fetch("/game_data.json") on startup
    - Two derived datasets:
      • allMapEvents — filtered by map/date/match only (feeds heatmap + stats)
      • fEvents — filtered by map/date/match + trail toggles + event toggles (feeds canvas)
    - Single canvas renders all layers via ctx.scale(zoom) + ctx.translate(-viewX,-viewY)
```

The two-dataset split was a mid-build decision. Originally heatmap and markers shared the same filtered data. But toggling off "Storm Death" was removing storm events from the heatmap AND changing the stats numbers. That's wrong — a designer wants the heatmap to always show the full picture. So `allMapEvents` stays unfiltered by event toggles, while `fEvents` respects them.

---

## Coordinate Mapping

The game uses 3D world coordinates (x, y, z). The `y` column is vertical elevation — not used for 2D plotting. Minimap images are 1024×1024.

**Formula:**

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale
pixel_x = u × canvas_size
pixel_y = (1 - v) × canvas_size     ← Y flipped (image origin = top-left)
```

**Map configs:**

| Map           | Scale | Origin X | Origin Z |
| ------------- | ----- | -------- | -------- |
| AmbroseValley | 900   | -370     | -473     |
| GrandRift     | 581   | -290     | -290     |
| Lockdown      | 1000  | -500     | -500     |

The Y-flip caught me initially — without `(1 - v)`, everything renders upside down because image coordinates have (0,0) at top-left while the game world has Z increasing upward. Verified by plotting events on all three maps and checking that paths follow roads and buildings.

For zoom: the canvas uses a viewport approach — `ctx.scale(zoom)` + `ctx.translate(-viewX, -viewY)`. All coordinates stay in mapSz space. The viewport window is clamped so the map never leaves the frame. Earlier I tried CSS `transform: scale()` on the canvas container — it caused the map to jump off-frame on trackpad scroll and markers scaled independently from the map image. Scrapped it entirely.

---

## Assumptions and Data Nuances

**Bot detection.** Numeric `user_id` = bot, UUID = human. Confirmed by cross-referencing with event types: numeric IDs produce `BotPosition`, UUIDs produce `Position`. Consistent across the full dataset.

**BotKill double-counting.** `BotKill` events appear on both sides — the human's file ("I killed a bot") and the bot's file ("I was involved in a bot kill"). A single bot death can show as 2 BotKill records.

> **Example:** Match `b971c686` on AmbroseValley (Feb 10) shows 15 BotKill events and 11 BotKilled events. The 15 includes kills recorded from human `b2365f20`'s file AND from the bots' own files (1464, 1448, 1474, etc.). The actual number of bots that died is 11 — matching the BotKilled count. The 4-event gap is the human's duplicate records.

> **Design decision:** The tool displays raw counts rather than attempting deduplication. Deduplication would require matching kill events across player files by timestamp and coordinates — fragile logic that could silently drop legitimate events. Showing raw counts with this documented context is more transparent than a "smart" count that might be wrong.

**Incomplete bot data.** Some matches only contain the human player's parquet file. The bots they fought have no position data in the dataset.

> **Example:** Match `8fb818f9` on Lockdown (Feb 11) has 1 human player (`77f3a15f`) with 3 BotKill events and 1 KilledByStorm — but zero bot players in the data. The human killed 3 bots, but none of those bots have parquet files in the dataset. The tool correctly shows 3 orange BotKill markers on the map (from the human's perspective) but no bot trails or bot icons. The match card shows "🧑 1 🤖 0" accurately reflecting what's in the data, not what happened in the match.

> **Design decision:** The tool renders exactly what the data contains. No synthetic bot positions are generated. The match metadata (human/bot counts) reflects data availability, not gameplay reality.

**Event bytes encoding.** The `event` column is stored as binary in parquet. Decoded with `.decode('utf-8')` as specified in the game's data README.

**Timestamps.** `ts` represents time elapsed within the match, not wall-clock time. Events within a match are sorted by `ts` for playback. The timeline uses the min/max `ts` range of all map events so the heatmap can animate even when no trails or markers are active.

**February 14.** Partial day — data collection was ongoing. Treated identically to full days. The tool naturally shows less data for that date.

**Default view.** Footfall Density heatmap with trails and markers off. A designer opening the tool wants an overview first. Detail layers appear automatically when they select a match or player (smart auto-enable), and manual filter preferences persist across navigation.

---

## Tradeoffs

| What I considered                                            | What I chose                                           | Why                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Load all data at once vs fetch per map                       | Single 27MB JSON upfront                               | Loads in ~1-2 sec, zero lag when switching filters. Would chunk it if data grows 5x.                    |
| Show everything on match select vs make user toggle manually | Auto-enable trails + markers on match click            | A designer clicking a match wants to see it, not click 6 more buttons. Manual overrides are remembered. |
| One heatmap for everything vs separate heatmap from filters  | Heatmap always shows full data, markers follow filters | Heatmap = "what's the big picture." Markers = "show me specifics." Different questions, different data. |
| Pixel-perfect heatmap vs smooth blurred grid                 | Grid cells + blur                                      | Tried pixel-level first — too saturated. Grid + blur looks more natural and hot zones actually pop.     |
| CSS zoom vs canvas viewport zoom                             | Viewport zoom (canvas-native)                          | CSS zoom caused the map to jump off-frame on trackpad. Viewport zoom keeps the map locked in place.     |
