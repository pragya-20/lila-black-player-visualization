# User Journeys

How a Level Designer uses this tool in their daily workflow.

---

### 1. Identify dead zones on the map

**Goal:** Find which areas of the map players never visit

**Steps:**

1. Select a map (e.g., AmbroseValley), All Days
2. Footfall Density heatmap loads by default
3. Scan for dark areas with no magenta glow - these are dead zones
4. Toggle on Human Trails to confirm no paths cross those areas

**Outcome:** Level Designers identifies underused zones and decides whether to add loot incentives, reposition objectives, or reduce map boundaries. If 30%+ of the map is cold, that's wasted design effort.

---

### 2. Evaluate storm effectiveness

**Goal:** Determine if the storm is creating enough pressure on players

**Steps:**

1. Select a map, All Days
2. Toggle on Storm Death markers - check the count badge (e.g., "17")
3. Look for purple swirl icons on the map
4. Compare storm deaths to total deaths in the Map Totals panel

**Outcome:** If storm deaths are under 5% of total deaths (17 out of 505 on AmbroseValley), the storm isn't threatening enough. Level Designers considers increasing storm speed, randomizing storm direction, or moving extraction points further from safe zones.

---

### 3. Compare human vs bot movement patterns

**Goal:** Check if bot patrol routes create interesting encounters or are predictable

**Steps:**

1. Select a map, All Days or a specific date
2. Turn on both Human Trails (cyan) and Bot Trails (amber)
3. Compare where the two colors overlap vs where they don't
4. Select a specific match and press play to watch both move in real time

**Outcome:** If bot trails cluster in one area while humans roam elsewhere, bots are too predictable. Level Designers adjusts spawn points and patrol logic for more natural encounters across the full map.

---

### 4. Analyze a specific match play-by-play

**Goal:** Understand what happened in a single match - where did fights break out, who died where, how did the match flow

**Steps:**

1. Select a map and date
2. Go to Matches tab → click a specific match
3. Trails and markers auto-enable - full picture appears instantly
4. Press play → watch the match unfoLevel Designers at 2× or 5× speed
5. Pause at key moments, zoom into combat clusters

**Outcome:** Level Designers sees the match narrative - early looting phase, mid-game encounters, where and how deaths happen. Identifies if the pacing feels right or if there are dead periods where nothing happens.

---

### 5. Track a single player's journey

**Goal:** Understand one player's full experience - where they landed, what they looted, who they fought, how they died

**Steps:**

1. Select a match from the Matches tab
2. Go to Players tab → click a specific player
3. Their trail highlights with a selection ring on their current position
4. Check their kill/death stats in the player list
5. Play the timeline to watch their journey chronologically

**Outcome:** Level Designers sees whether the player explored the map or took the shortest path to loot and extract. If most players follow the same predictable route, the map needs alternative paths, better-placed POIs, or obstacles that force players to make choices.

---

### 6. Spot retention trends across dates

**Goal:** See if player activity is growing, stable, or declining over the 5-day period

**Steps:**

1. Select a map → click Feb 10 → note the event count and match count
2. Switch to Feb 11, Feb 12, Feb 13 - watch the numbers change
3. Toggle on Human Trails for each day - visually see fewer or more paths
4. Compare across maps - does one map retain better than others?

**Outcome:** If matches drop 60%+ in 3 days (AmbroseValley: ~200 matches on Feb 10 → ~78 on Feb 13), there's a retention problem. Level Designers cross-references with other insights - lack of PvP and weak storm pressure may be making matches feel repetitive.

---

### 7. Compare maps for design quality

**Goal:** Which map has the healthiest gameplay patterns - balanced combat, good loot distribution, effective storm

**Steps:**

1. Check all three maps on All Days - note stats for each
2. Compare kill counts, storm deaths, loot pickups, player counts
3. Switch Footfall Density heatmap on each map - compare coverage
4. Check Combat Zones heatmap - does one map have spread-out fights vs one concentrated kill zone?

**Outcome:** Level Designers identifies which map needs the most design attention. A map with zero PvP kills needs different fixes than a map with good PvP but too many storm deaths.
