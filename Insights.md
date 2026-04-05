# Insights

Here's what I found after analyzing all 3 maps across Feb 10–14, 2026.

---

## 1. 98% of matches have only 1 human — PvP can't happen

| Map           | Matches | Solo Human | % Solo |
| ------------- | ------- | ---------- | ------ |
| AmbroseValley | 566     | 552        | 98%    |
| GrandRift     | 59      | 57         | 97%    |
| Lockdown      | 171     | 170        | 99%    |

Only 3 PvP kills across 796 matches. I initially thought players were just avoiding fights, but the data shows something simpler — there's only 1 human per match almost every time. The rest are bots.

**Why a Level Designer should care:** All the PvP work on these maps — flanking routes, contested buildings, ambush corners — nobody's using it. As long as lobbies stay solo, the map is basically a single-player bot arena. If I were the LD, I'd shift focus to making bot encounters more interesting instead of building for PvP that can't happen yet.

**Action items:**

- Check if matchmaking is creating solo lobbies too quickly instead of waiting for more humans
- If player count stays low, redesign maps with PvE in mind — smarter bots, varied patrol routes
- **Metric:** Humans per match (even 2–3 would make the PvP design relevant)

---

## 2. Loot is spread across the map but combat collapses into one zone

I toggled between Loot Density and Combat Zones heatmaps on AmbroseValley and the difference was obvious — loot is picked up all over the map, but fights only happen in one spot (center-left). The Footfall heatmap shows the same thing: players follow roads and almost nobody goes off-road. The map edges and corners? Completely empty.

**Why a Level Designer should care:** That's a lot of map that nobody touches. All the cover, sightlines, and terrain work in those outer zones — players never see it. This tells you exactly which areas to fix first. You could also pull the storm boundary inward without losing anything — matches would be shorter and fights would be more packed together.

**Action items:**

- Split the bots across 2–3 zones instead of letting them cluster in one spot
- Make loot locations worth defending, not just quick pickups on the way to the "real" fight
- Shrink the playable area or speed up the storm to cut out dead zones
- **Metric:** Unique zones visited per match (if players only see 30% of the map, the rest needs rethinking)

---

## 3. Player count is dropping fast — but Lockdown's tighter design retains better

| Date   | AmbroseValley | GrandRift | Lockdown  |
| ------ | ------------- | --------- | --------- |
| Feb 10 | 82 humans     | 13 humans | 33 humans |
| Feb 11 | 70            | 7         | 27        |
| Feb 12 | 51            | 7         | 15        |
| Feb 13 | 38            | 5         | 18        |

AmbroseValley lost 54% of players in 3 days. GrandRift lost 62%. But Lockdown actually recovered — it went from 15 to 18 humans on Feb 13. That caught my eye because it's the only map where the number went up.

Looking at why: Lockdown has the highest storm death rate (9.2% vs AmbroseValley's 3.4%) and a smaller, tighter layout. Players can't just wander around safely. The storm actually matters there.

**Why a Level Designer should care:** Retention is different on each map — and that tells you which design approach is working. Lockdown's tighter spaces and real storm pressure seem to keep solo players coming back. AmbroseValley's wide open layout with a harmless storm means every match plays out the same way. If I'm a LD, I'd use these numbers to argue for smaller play areas and a more aggressive storm on the next map.

**Action items:**

- Look at Lockdown's storm settings as a starting point for "how much pressure is enough"
- Speed up the storm on AmbroseValley — right now it kills 0.03 players per match, which is basically nothing
- Add some variety between matches — randomized events, different bot spawns — so it doesn't feel like the same loop every time
- **Metrics:** Day 1/Day 3/Day 7 retention per map, storm deaths per match
