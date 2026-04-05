import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   LILA BLACK — Player Journey Visualizer  v8
   • Storm = purple #c06bff with swirl icon
   • Sticky filters across navigation
   • Click-to-tooltip (feature flag, off by default)
   • Death animation on timeline (icon → death marker)
   • Heatmap master toggle
   • Full text visibility overhaul — all text readable
   ═══════════════════════════════════════════════════════════════════════ */

const MAP_CFG = {
  AmbroseValley: {
    scale: 900,
    ox: -370,
    oz: -473,
    accent: "#3ee68a",
    bg: "#0d2618",
    img: "/AmbroseValley_Minimap.png",
  },
  GrandRift: {
    scale: 581,
    ox: -290,
    oz: -290,
    accent: "#5ba8ff",
    bg: "#0d1a2e",
    img: "/GrandRift_Minimap.png",
  },
  Lockdown: {
    scale: 1000,
    ox: -500,
    oz: -500,
    accent: "#ff6b8a",
    bg: "#2a0d18",
    img: "/Lockdown_Minimap.jpg",
  },
};
const TRAIL_CLR = {
  human: { r: 0, g: 220, b: 255 },
  bot: { r: 212, g: 148, b: 58 },
};
const EVT = {
  Kill: { color: "#ff2d2d", shape: "diamond", label: "PvP Kill" },
  Killed: { color: "#ff6b8a", shape: "diamond", label: "PvP Death" },
  BotKill: { color: "#ff9500", shape: "circle", label: "Bot Kill" },
  BotKilled: { color: "#22d68a", shape: "hexagon", label: "Killed by Bot" },
  KilledByStorm: { color: "#c06bff", shape: "storm", label: "Storm Death" },
  Loot: { color: "#ffd23f", shape: "square", label: "Loot Pickup" },
};
const ALL_MARKER_EVTS = [
  "Kill",
  "Killed",
  "BotKill",
  "BotKilled",
  "KilledByStorm",
  "Loot",
];
const HEAT_MODES = [
  {
    id: "combat",
    label: "Combat Zones",
    events: ["Kill", "BotKill", "Killed", "BotKilled", "KilledByStorm"],
    colors: [
      [255, 45, 45],
      [255, 100, 40],
      [255, 160, 60],
      [255, 220, 80],
      [255, 255, 120],
    ],
  },
  {
    id: "traffic",
    label: "Footfall Density",
    events: ["Position", "BotPosition"],
    colors: [
      [180, 80, 180],
      [220, 60, 220],
      [255, 40, 255],
      [255, 120, 255],
      [255, 200, 255],
    ],
  },
  {
    id: "loot",
    label: "Loot Density",
    events: ["Loot"],
    colors: [
      [255, 180, 30],
      [255, 210, 63],
      [255, 230, 80],
      [255, 245, 130],
      [255, 255, 200],
    ],
  },
];
const EMPTY = { events: [], matches: [], dates: [] };

function w2p(x, z, mapId, sz) {
  const c = MAP_CFG[mapId];
  if (!c) return [0, 0];
  return [((x - c.ox) / c.scale) * sz, (1 - (z - c.oz) / c.scale) * sz];
}

function drawArrow(ctx, x1, y1, x2, y2, color, size) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const mx = (x1 + x2) / 2,
    my = (y1 + y2) / 2;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size * 1.3, 0);
  ctx.lineTo(-size * 0.7, -size * 0.75);
  ctx.lineTo(-size * 0.1, 0);
  ctx.lineTo(-size * 0.7, size * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStorm(ctx, px, py, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let i = 0; i < 30; i++) {
    const t = i / 30,
      r = size * (1 - t * 0.5);
    const a = t * Math.PI * 3.8 - Math.PI / 2;
    const sx = px + Math.cos(a) * r,
      sy = py - t * size * 2.2 + size * 0.7;
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py - size * 1.1, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawMarker(ctx, px, py, shape, size, color) {
  if (shape === "storm") {
    drawStorm(ctx, px, py, size, color);
    return;
  }
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  if (shape === "diamond") {
    ctx.moveTo(px, py - size);
    ctx.lineTo(px + size, py);
    ctx.lineTo(px, py + size);
    ctx.lineTo(px - size, py);
    ctx.closePath();
  } else if (shape === "hexagon") {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      i === 0
        ? ctx.moveTo(px + size * Math.cos(a), py + size * Math.sin(a))
        : ctx.lineTo(px + size * Math.cos(a), py + size * Math.sin(a));
    }
    ctx.closePath();
  } else if (shape === "square") {
    ctx.rect(px - size * 0.7, py - size * 0.7, size * 1.4, size * 1.4);
  } else {
    ctx.arc(px, py, size, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawIcon(ctx, px, py, isBot, sz, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (isBot) {
    ctx.fillStyle = "#c48a30";
    ctx.strokeStyle = "#e8b050";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(px - sz, py - sz, sz * 2, sz * 2, sz * 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff3333";
    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = 6;
    ctx.fillRect(px - sz * 0.55, py - sz * 0.3, sz * 0.45, sz * 0.4);
    ctx.fillRect(px + sz * 0.1, py - sz * 0.3, sz * 0.45, sz * 0.4);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#e8b050";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py - sz);
    ctx.lineTo(px, py - sz * 1.7);
    ctx.stroke();
    ctx.fillStyle = "#ff3333";
    ctx.beginPath();
    ctx.arc(px, py - sz * 1.7, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#00dcff";
    ctx.strokeStyle = "#66eeff";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#00dcff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(px, py - sz * 0.6, sz * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py - sz * 0.05);
    ctx.lineTo(px, py + sz * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - sz * 0.65, py + sz * 0.15);
    ctx.lineTo(px + sz * 0.65, py + sz * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py + sz * 0.7);
    ctx.lineTo(px - sz * 0.45, py + sz * 1.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py + sz * 0.7);
    ctx.lineTo(px + sz * 0.45, py + sz * 1.3);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function buildHeatCanvas(evts, mode, mapId, sz) {
  const m = HEAT_MODES.find((h) => h.id === mode);
  if (!m) return null;
  // Grid-based with large cells + canvas blur for smooth result
  const gs = Math.ceil(sz / 4);
  const grid = new Float32Array(gs * gs);
  let peak = 0;
  const R = 7;
  for (const e of evts) {
    if (!m.events.includes(e.evt)) continue;
    const [px, py] = w2p(e.x, e.z, mapId, sz);
    const gx = Math.floor(px / 4),
      gy = Math.floor(py / 4);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const nx = gx + dx,
          ny = gy + dy;
        if (nx < 0 || nx >= gs || ny < 0 || ny >= gs) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        const idx = ny * gs + nx;
        grid[idx] += Math.exp((-d * d) / (R * 0.55));
        if (grid[idx] > peak) peak = grid[idx];
      }
  }
  if (peak === 0) return null;
  const ramp = m.colors;
  const cs = sz / gs;
  const oc = document.createElement("canvas");
  oc.width = sz;
  oc.height = sz;
  const octx = oc.getContext("2d");
  for (let y = 0; y < gs; y++)
    for (let x = 0; x < gs; x++) {
      const v = grid[y * gs + x];
      if (v < peak * 0.015) continue;
      const t = Math.min(1, v / peak);
      const ci = t * (ramp.length - 1);
      const lo = Math.floor(ci),
        hi = Math.min(lo + 1, ramp.length - 1);
      const f = ci - lo;
      const r = ramp[lo][0] + (ramp[hi][0] - ramp[lo][0]) * f;
      const g = ramp[lo][1] + (ramp[hi][1] - ramp[lo][1]) * f;
      const b = ramp[lo][2] + (ramp[hi][2] - ramp[lo][2]) * f;
      octx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${0.2 + 0.8 * t})`;
      octx.fillRect(x * cs, y * cs, cs + 1, cs + 1);
    }
  // Apply blur for smooth gradients
  const oc2 = document.createElement("canvas");
  oc2.width = sz;
  oc2.height = sz;
  const ctx2 = oc2.getContext("2d");
  ctx2.filter = "blur(8px)";
  ctx2.drawImage(oc, 0, 0);
  ctx2.filter = "none";
  return oc2;
}

// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selMap, setSelMap] = useState("AmbroseValley");
  const [selDate, setSelDate] = useState("all");
  const [selMatch, setSelMatch] = useState("all");
  const [showHumanTrails, setShowHumanTrails] = useState(false);
  const [showBotTrails, setShowBotTrails] = useState(false);
  const [activeEvts, setActiveEvts] = useState(new Set());
  const [userDisabled, setUserDisabled] = useState(new Set());
  const [heatMode, setHeatMode] = useState("traffic");
  const [heatOn, setHeatOn] = useState(true); // master toggle
  const [heatOpacity, setHeatOpacity] = useState(0.85);
  const [selPlayer, setSelPlayer] = useState(null);
  const [tab, setTab] = useState("filters");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mapSz, setMapSz] = useState(620);
  const [zoom, setZoom] = useState(1);
  const [viewX, setViewX] = useState(0);
  const [viewY, setViewY] = useState(0);
  const [showTooltips, setShowTooltips] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const animRef = useRef(null);
  const mainCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const mapImgRef = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    fetch("/game_data.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setLoadError(e.message);
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      mapImgRef.current = img;
      setImgLoaded(true);
    };
    img.onerror = () => {
      mapImgRef.current = null;
      setImgLoaded(true);
    };
    img.src = MAP_CFG[selMap].img;
    setImgLoaded(false);
  }, [selMap]);
  useEffect(() => {
    const fn = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setMapSz(
          Math.max(400, Math.min(720, Math.min(r.width - 24, r.height - 100))),
        );
      }
    };
    fn();
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Zoom/Pan — simple viewport: viewX,viewY = top-left of visible area in map coords
  // Everything draws at mapSz scale, viewport clips what's visible
  const clampView = useCallback(
    (vx, vy, z) => {
      const maxV = mapSz - mapSz / z; // max viewX/viewY so viewport stays in bounds
      return {
        x: Math.max(0, Math.min(maxV, vx)),
        y: Math.max(0, Math.min(maxV, vy)),
      };
    },
    [mapSz],
  );

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = mainCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Mouse position as fraction of canvas
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 0.93 : 1.07;
      setZoom((pz) => {
        const nz = Math.max(1, Math.min(6, pz * factor));
        // Zoom toward mouse: adjust view so point under cursor stays fixed
        const oldW = mapSz / pz,
          newW = mapSz / nz;
        const worldX = viewX + fx * oldW;
        const worldY = viewY + fy * oldW;
        const nvx = worldX - fx * newW;
        const nvy = worldY - fy * newW;
        const clamped = clampView(nvx, nvy, nz);
        setViewX(clamped.x);
        setViewY(clamped.y);
        return nz;
      });
    },
    [viewX, viewY, mapSz, clampView],
  );

  const handleMouseDown = useCallback(
    (e) => {
      if (zoom <= 1.01) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, vx: viewX, vy: viewY };
    },
    [zoom, viewX, viewY],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isPanning.current) return;
      const dx = (e.clientX - panStart.current.x) / zoom;
      const dy = (e.clientY - panStart.current.y) / zoom;
      // Pan is inverted: drag right = view moves left
      const clamped = clampView(
        panStart.current.vx - dx,
        panStart.current.vy - dy,
        zoom,
      );
      setViewX(clamped.x);
      setViewY(clamped.y);
    },
    [zoom, clampView],
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);
  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);
  const resetView = useCallback(() => {
    setZoom(1);
    setViewX(0);
    setViewY(0);
  }, []);

  // Click-to-tooltip
  const handleCanvasClick = useCallback(
    (e) => {
      if (!showTooltips) return;
      const rect = mainCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Convert screen click to world coords
      const screenX = e.clientX - rect.left,
        screenY = e.clientY - rect.top;
      const worldX = viewX + screenX / zoom;
      const worldY = viewY + screenY / zoom;
      let best = null,
        bestDist = 15;
      for (const ev of visEventsRef.current) {
        if (ev.evt === "Position" || ev.evt === "BotPosition") continue;
        const [px, py] = w2p(ev.x, ev.z, selMap, mapSz);
        const d = Math.sqrt((px - worldX) ** 2 + (py - worldY) ** 2);
        if (d < bestDist) {
          bestDist = d;
          best = ev;
        }
      }
      if (best) {
        setTooltip({ x: screenX, y: screenY, evt: best });
      } else {
        setTooltip(null);
      }
    },
    [showTooltips, zoom, viewX, viewY, mapSz, selMap],
  );

  const safe = data || EMPTY;
  const fMatches = useMemo(
    () =>
      safe.matches.filter(
        (m) => m.map === selMap && (selDate === "all" || m.date === selDate),
      ),
    [safe.matches, selMap, selDate],
  );
  const allMapEvents = useMemo(
    () =>
      safe.events.filter((e) => {
        if (e.map !== selMap) return false;
        if (selDate !== "all" && e.date !== selDate) return false;
        if (selMatch !== "all" && e.mid !== selMatch) return false;
        return true;
      }),
    [safe.events, selMap, selDate, selMatch],
  );

  // Time range across ALL events (for heatmap timeline animation)
  const allTimeRange = useMemo(() => {
    if (allMapEvents.length === 0) return [0, 1];
    let mn = Infinity,
      mx = -Infinity;
    for (const e of allMapEvents) {
      if (e.ts < mn) mn = e.ts;
      if (e.ts > mx) mx = e.ts;
    }
    return [mn, mx];
  }, [allMapEvents]);
  const allCutTs =
    allTimeRange[0] + (allTimeRange[1] - allTimeRange[0]) * progress;

  // Heatmap events: filtered by timeline when playing, otherwise all events
  const heatEvents = useMemo(() => {
    if (!playing && progress === 0) return allMapEvents;
    if (!playing && progress >= 1) return allMapEvents;
    return allMapEvents.filter((e) => e.ts <= allCutTs);
  }, [allMapEvents, playing, progress, allCutTs]);
  const evtCounts = useMemo(() => {
    const c = {};
    for (const e of allMapEvents) c[e.evt] = (c[e.evt] || 0) + 1;
    return c;
  }, [allMapEvents]);

  const fEvents = useMemo(
    () =>
      safe.events.filter((e) => {
        if (e.map !== selMap) return false;
        if (selDate !== "all" && e.date !== selDate) return false;
        if (selMatch !== "all" && e.mid !== selMatch) return false;
        if (selPlayer && e.uid !== selPlayer) return false;
        if (e.evt === "Position") return showHumanTrails;
        if (e.evt === "BotPosition") return showBotTrails;
        if (!activeEvts.has(e.evt)) return false;
        if ((e.evt === "BotKill" || e.evt === "BotKilled") && !showBotTrails)
          return false;
        return true;
      }),
    [
      safe.events,
      selMap,
      selDate,
      selMatch,
      showHumanTrails,
      showBotTrails,
      activeEvts,
      selPlayer,
    ],
  );

  const timeRange = useMemo(() => {
    if (fEvents.length === 0) return allTimeRange;
    let mn = Infinity,
      mx = -Infinity;
    for (const e of fEvents) {
      if (e.ts < mn) mn = e.ts;
      if (e.ts > mx) mx = e.ts;
    }
    return [mn, mx];
  }, [fEvents, allTimeRange]);
  const cutTs = timeRange[0] + (timeRange[1] - timeRange[0]) * progress;
  const visEvents = useMemo(() => {
    if (progress <= 0) return fEvents;
    if (progress >= 1) return fEvents;
    return fEvents.filter((e) => e.ts <= cutTs);
  }, [fEvents, progress, cutTs]);
  const visEventsRef = useRef(visEvents);
  useEffect(() => {
    visEventsRef.current = visEvents;
  }, [visEvents]);

  const stats = useMemo(() => {
    let k = 0,
      d = 0,
      l = 0,
      s = 0;
    const ps = new Set(),
      ms = new Set();
    for (const e of allMapEvents) {
      if (e.evt === "Kill" || e.evt === "BotKill") k++;
      if (
        e.evt === "Killed" ||
        e.evt === "BotKilled" ||
        e.evt === "KilledByStorm"
      )
        d++;
      if (e.evt === "Loot") l++;
      if (e.evt === "KilledByStorm") s++;
      ps.add(e.uid);
      ms.add(e.mid);
    }
    return {
      kills: k,
      deaths: d,
      loot: l,
      storm: s,
      players: ps.size,
      matches: ms.size,
      total: allMapEvents.length,
    };
  }, [allMapEvents]);
  const playerList = useMemo(() => {
    const m = {};
    for (const e of visEvents) {
      if (!m[e.uid])
        m[e.uid] = { id: e.uid, bot: e.bot, n: 0, kills: 0, deaths: 0 };
      m[e.uid].n++;
      if (e.evt === "Kill" || e.evt === "BotKill") m[e.uid].kills++;
      if (
        e.evt === "Killed" ||
        e.evt === "BotKilled" ||
        e.evt === "KilledByStorm"
      )
        m[e.uid].deaths++;
    }
    return Object.values(m).sort((a, b) => b.n - a.n);
  }, [visEvents]);
  const isSingleMatch = selMatch !== "all";

  // Build death map for timeline animation: uid → {ts, evt} of death event
  const deathMap = useMemo(() => {
    const dm = {};
    for (const e of allMapEvents) {
      if (
        e.evt === "Killed" ||
        e.evt === "BotKilled" ||
        e.evt === "KilledByStorm"
      ) {
        if (!dm[e.uid] || e.ts > dm[e.uid].ts) dm[e.uid] = e;
      }
    }
    return dm;
  }, [allMapEvents]);

  // STICKY FILTERS: only reset match/player, keep trails+markers+heatmap
  const selectMatch = useCallback(
    (mid) => {
      setSelMatch(mid);
      setSelPlayer(null);
      setProgress(0);
      setPlaying(false);
      setTooltip(null);
      if (mid !== "all") {
        setShowHumanTrails(true);
        setShowBotTrails(true);
        setActiveEvts(
          new Set(ALL_MARKER_EVTS.filter((e) => !userDisabled.has(e))),
        );
      }
    },
    [userDisabled],
  );

  const selectPlayer = useCallback(
    (pid) => {
      setSelPlayer((prev) => {
        const next = prev === pid ? null : pid;
        if (next) {
          setShowHumanTrails(true);
          setShowBotTrails(true);
          setActiveEvts(
            new Set(ALL_MARKER_EVTS.filter((e) => !userDisabled.has(e))),
          );
        }
        return next;
      });
    },
    [userDisabled],
  );

  const toggleEvt = useCallback((e) => {
    setActiveEvts((prev) => {
      const n = new Set(prev);
      if (n.has(e)) {
        n.delete(e);
        setUserDisabled((p) => new Set([...p, e]));
      } else {
        n.add(e);
        setUserDisabled((p) => {
          const np = new Set(p);
          np.delete(e);
          return np;
        });
      }
      return n;
    });
  }, []);

  // Playback with clamped progress
  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    let last = null;
    const tick = (t) => {
      if (last !== null) {
        const dt = Math.max(0, (t - last) / 1000);
        setProgress((p) => {
          const np = Math.max(0, Math.min(1, p + dt * 0.025 * speed));
          if (np >= 1) {
            setPlaying(false);
            return 1;
          }
          return np;
        });
      }
      last = t;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, speed]);

  // ═══ SINGLE CANVAS RENDER — viewport zoom ═══
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const sz = mapSz;
    canvas.width = sz;
    canvas.height = sz;
    ctx.clearRect(0, 0, sz, sz);

    // Viewport transform: scale up, then shift to show the viewX,viewY region
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-viewX, -viewY);

    // Everything below draws in mapSz coordinate space (0 to mapSz)

    // Minimap
    const img = mapImgRef.current;
    if (img) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(img, 0, 0, sz, sz);
      ctx.globalAlpha = 1;
    } else {
      const grd = ctx.createRadialGradient(
        sz * 0.4,
        sz * 0.4,
        0,
        sz * 0.5,
        sz * 0.5,
        sz * 0.7,
      );
      grd.addColorStop(0, MAP_CFG[selMap].bg);
      grd.addColorStop(1, "#0a0a10");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, sz, sz);
    }

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 8; i++) {
      const p = (i / 8) * sz;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, sz);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(sz, p);
      ctx.stroke();
    }

    // Trails — all coordinates use mapSz (sz) directly
    const byP = {};
    for (const e of visEvents) {
      if (e.evt !== "Position" && e.evt !== "BotPosition") continue;
      if (!byP[e.uid]) byP[e.uid] = [];
      byP[e.uid].push(e);
    }
    for (const [uid, evts] of Object.entries(byP)) {
      const s = evts.sort((a, b) => a.ts - b.ts);
      if (s.length < 2) continue;
      const isBot = s[0].bot,
        isSel = selPlayer === uid;
      const t = isBot ? TRAIL_CLR.bot : TRAIL_CLR.human;
      const bA = isSel ? 0.95 : isBot ? 0.4 : 0.6;
      ctx.lineWidth = isSel ? 3.5 : isBot ? 1.5 : 2.5;
      ctx.setLineDash(isBot ? [5, 6] : []);
      ctx.lineCap = "round";
      const pts = s.map((e) => w2p(e.x, e.z, selMap, sz));
      for (let i = 1; i < pts.length; i++) {
        const frac = i / (pts.length - 1);
        const alpha = bA * (0.45 + 0.55 * frac);
        ctx.strokeStyle = `rgba(${t.r},${t.g},${t.b},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const interval = Math.max(3, Math.floor(pts.length / 7));
      for (let i = interval; i < pts.length; i += interval) {
        const [x1, y1] = pts[i - 1],
          [x2, y2] = pts[i];
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        if (dist < 3) continue;
        const frac = i / (pts.length - 1);
        const aa = bA * (0.7 + 0.3 * frac);
        const bright = `rgba(${Math.min(255, t.r + 50)},${Math.min(255, t.g + 50)},${Math.min(255, t.b + 50)},${aa})`;
        drawArrow(ctx, x1, y1, x2, y2, bright, isSel ? 10 : isBot ? 7 : 9);
      }
    }

    // Heatmap (above trails)
    if (heatOn && heatMode) {
      const hc = buildHeatCanvas(heatEvents, heatMode, selMap, sz);
      if (hc) {
        ctx.globalAlpha = heatOpacity;
        ctx.drawImage(hc, 0, 0);
        ctx.globalAlpha = 1;
      }
    }

    // Event markers
    const markerSz = isSingleMatch ? 7 : 5;
    for (const e of visEvents) {
      if (e.evt === "Position" || e.evt === "BotPosition") continue;
      const cfg = EVT[e.evt];
      if (!cfg) continue;
      const [px, py] = w2p(e.x, e.z, selMap, sz);
      let sc = 1;
      if (playing) {
        const span = (timeRange[1] - timeRange[0]) * 0.02 || 1,
          age = (cutTs - e.ts) / span;
        if (age >= 0 && age < 1) {
          sc = 1 + (1 - age) * 0.8;
          ctx.globalAlpha = 0.5 + 0.5 * (1 - age);
        }
      }
      drawMarker(ctx, px, py, cfg.shape, markerSz * sc, cfg.color);
      ctx.globalAlpha = 1;
    }

    // Player icons + death animation (show during match view, playback, OR paused mid-timeline)
    if (isSingleMatch || playing || (progress > 0 && progress < 1)) {
      const latest = {};
      const tsL = playing || progress > 0 ? cutTs : Infinity;
      for (const e of fEvents) {
        if (e.ts > tsL) continue;
        if (e.evt !== "Position" && e.evt !== "BotPosition") continue;
        if (!latest[e.uid] || e.ts > latest[e.uid].ts) latest[e.uid] = e;
      }
      for (const [uid, e] of Object.entries(latest)) {
        const [px, py] = w2p(e.x, e.z, selMap, sz);
        const isSel = selPlayer === uid;
        const death = deathMap[uid];
        if (progress > 0 && death && death.ts <= cutTs) {
          const deathCfg = EVT[death.evt];
          if (deathCfg) {
            const [dx, dy] = w2p(death.x, death.z, selMap, sz);
            drawMarker(ctx, dx, dy, deathCfg.shape, 10, deathCfg.color);
          }
        } else {
          drawIcon(
            ctx,
            px,
            py,
            e.bot,
            e.bot ? 8 : 9,
            isSel ? 1 : e.bot ? 0.8 : 0.95,
          );
          if (isSel) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(px, py, 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    ctx.restore();
  }, [
    visEvents,
    fEvents,
    allMapEvents,
    heatEvents,
    selMap,
    mapSz,
    selPlayer,
    zoom,
    viewX,
    viewY,
    playing,
    cutTs,
    timeRange,
    isSingleMatch,
    heatMode,
    heatOn,
    heatOpacity,
    imgLoaded,
    deathMap,
  ]);

  const accent = MAP_CFG[selMap].accent;
  // VISIBILITY FIX: inactive color bumped from #9a9aa6 to #b0b0ba
  const B = (on, col = "#fff") => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid",
    borderColor: on ? col + "40" : "rgba(255,255,255,0.1)",
    background: on ? col + "12" : "transparent",
    color: on ? col : "#b0b0ba",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    transition: "all .12s",
    textAlign: "left",
  });
  const StormSVG = ({ size = 14, color = "#c06bff", active = true }) => (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <path
        d="M8 2C10 2 12 3 12 4.5C12 6 10 6 8 6.5C6 7 4 7 4 8.5C4 10 6 10 8 10.5C10 11 11 11 11 12.5"
        fill="none"
        stroke={active ? color : "#666"}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8" cy="2" r="1.5" fill={active ? color : "#666"} />
    </svg>
  );

  if (loading || !data)
    return (
      <div
        style={{
          fontFamily: "'IBM Plex Mono',monospace",
          background: "#08080c",
          color: "#b0b0ba",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "linear-gradient(135deg,#ff3b3b,#ff8c42)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 17,
              color: "#fff",
            }}
          >
            L
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e4e4e8" }}>
            LILA BLACK
          </div>
        </div>
        {loadError ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#ff3b3b", fontSize: 14, marginBottom: 8 }}>
              Failed to load data
            </div>
            <div style={{ fontSize: 12, color: "#b0b0ba" }}>
              Make sure{" "}
              <code style={{ color: "#e4e4e8" }}>public/game_data.json</code>{" "}
              exists.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                border: "2px solid #555",
                borderTop: "2px solid #00dcff",
                borderRadius: "50%",
                animation: "spin .8s linear infinite",
              }}
            />
            <div style={{ fontSize: 12 }}>Loading...</div>
          </div>
        )}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono','Menlo',monospace",
        background: "#08080c",
        color: "#d4d4d8",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontSize: 12,
      }}
    >
      {/* TOP BAR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
          flexShrink: 0,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: "linear-gradient(135deg,#ff3b3b,#ff8c42)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
              color: "#fff",
            }}
          >
            L
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f4f4f5" }}>
              LILA BLACK
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#b0b0ba",
                letterSpacing: "2px",
                fontWeight: 600,
              }}
            >
              PLAYER JOURNEY VISUALIZER
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "rgba(255,255,255,0.05)",
            borderRadius: 8,
            padding: 3,
          }}
        >
          {Object.entries(MAP_CFG).map(([n, c]) => (
            <button
              key={n}
              onClick={() => {
                setSelMap(n);
                setSelMatch("all");
                setSelPlayer(null);
                resetView();
                setTooltip(null);
              }}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "inherit",
                background: selMap === n ? c.accent + "20" : "transparent",
                color: selMap === n ? c.accent : "#b0b0ba",
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "rgba(255,255,255,0.05)",
            borderRadius: 8,
            padding: 3,
          }}
        >
          <button
            onClick={() => {
              setSelDate("all");
              setSelMatch("all");
              setSelPlayer(null);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "inherit",
              background:
                selDate === "all" ? "rgba(255,255,255,0.1)" : "transparent",
              color: selDate === "all" ? "#e4e4e8" : "#999",
            }}
          >
            All Days
          </button>
          {safe.dates.map((d) => (
            <button
              key={d}
              onClick={() => {
                setSelDate(d);
                setSelMatch("all");
                setSelPlayer(null);
              }}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
                background:
                  selDate === d ? "rgba(255,255,255,0.1)" : "transparent",
                color: selDate === d ? "#e4e4e8" : "#999",
              }}
            >
              Feb {d.slice(8)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 10px ${accent}`,
            }}
          />
          <span style={{ fontSize: 11, color: "#d4d4d8", fontWeight: 600 }}>
            {stats.total.toLocaleString()} events
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT PANEL */}
        <div
          style={{
            width: 270,
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {["filters", "players", "matches"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  fontFamily: "inherit",
                  fontWeight: 700,
                  background:
                    tab === t ? "rgba(255,255,255,0.04)" : "transparent",
                  color: tab === t ? "#e4e4e8" : "#999",
                  borderBottom:
                    tab === t ? `2px solid ${accent}` : "2px solid transparent",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
            {tab === "filters" && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                {/* TRAILS */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#c4c4cc",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "1.5px",
                      fontWeight: 700,
                    }}
                  >
                    Trails
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <button
                      onClick={() => setShowHumanTrails(!showHumanTrails)}
                      style={{
                        ...B(showHumanTrails, "#00dcff"),
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <svg width="22" height="6" viewBox="0 0 22 6">
                          <line
                            x1="0"
                            y1="3"
                            x2="15"
                            y2="3"
                            stroke={showHumanTrails ? "#00dcff" : "#666"}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <polygon
                            points="22,3 16,0 16,6"
                            fill={showHumanTrails ? "#00dcff" : "#666"}
                          />
                        </svg>
                        <span>Human Trails</span>
                      </span>
                      <span
                        style={{
                          width: 36,
                          height: 20,
                          borderRadius: 10,
                          background: showHumanTrails
                            ? "#00dcff"
                            : "rgba(255,255,255,0.08)",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 3px",
                          transition: "all .2s",
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: showHumanTrails ? "#fff" : "#666",
                            transform: showHumanTrails
                              ? "translateX(16px)"
                              : "translateX(0)",
                            transition: "all .2s",
                          }}
                        />
                      </span>
                    </button>
                    <button
                      onClick={() => setShowBotTrails(!showBotTrails)}
                      style={{
                        ...B(showBotTrails, "#d4943a"),
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <svg width="22" height="6" viewBox="0 0 22 6">
                          <line
                            x1="0"
                            y1="3"
                            x2="15"
                            y2="3"
                            stroke={showBotTrails ? "#d4943a" : "#666"}
                            strokeWidth="2"
                            strokeDasharray="4 3"
                            strokeLinecap="round"
                          />
                          <polygon
                            points="22,3 16,0 16,6"
                            fill={showBotTrails ? "#d4943a" : "#666"}
                          />
                        </svg>
                        <span>Bot Trails</span>
                      </span>
                      <span
                        style={{
                          width: 36,
                          height: 20,
                          borderRadius: 10,
                          background: showBotTrails
                            ? "#d4943a"
                            : "rgba(255,255,255,0.08)",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 3px",
                          transition: "all .2s",
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: showBotTrails ? "#fff" : "#666",
                            transform: showBotTrails
                              ? "translateX(16px)"
                              : "translateX(0)",
                            transition: "all .2s",
                          }}
                        />
                      </span>
                    </button>
                  </div>
                </div>

                {/* EVENT MARKERS */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#c4c4cc",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "1.5px",
                      fontWeight: 700,
                    }}
                  >
                    Event Markers
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 3 }}
                  >
                    {Object.entries(EVT)
                      .filter(([k]) => {
                        if (
                          (k === "BotKill" || k === "BotKilled") &&
                          !showBotTrails
                        )
                          return false;
                        return true;
                      })
                      .map(([k, c]) => {
                        const count = evtCounts[k] || 0;
                        const isOn = activeEvts.has(k);
                        return (
                          <button
                            key={k}
                            onClick={() => toggleEvt(k)}
                            style={{
                              ...B(isOn, c.color),
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 12px",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 16,
                                  height: 16,
                                }}
                              >
                                {c.shape === "diamond" && (
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                  >
                                    <polygon
                                      points="7,1 13,7 7,13 1,7"
                                      fill={isOn ? c.color : "#666"}
                                    />
                                  </svg>
                                )}
                                {c.shape === "circle" && (
                                  <svg width="14" height="14">
                                    <circle
                                      cx="7"
                                      cy="7"
                                      r="6"
                                      fill={isOn ? c.color : "#666"}
                                    />
                                  </svg>
                                )}
                                {c.shape === "hexagon" && (
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                  >
                                    <polygon
                                      points="7,1 13,4 13,10 7,13 1,10 1,4"
                                      fill={isOn ? c.color : "#666"}
                                    />
                                  </svg>
                                )}
                                {c.shape === "storm" && (
                                  <StormSVG active={isOn} color={c.color} />
                                )}
                                {c.shape === "square" && (
                                  <svg width="14" height="14">
                                    <rect
                                      x="1"
                                      y="1"
                                      width="12"
                                      height="12"
                                      rx="1"
                                      fill={isOn ? c.color : "#666"}
                                    />
                                  </svg>
                                )}
                              </span>
                              <span>{c.label}</span>
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: isOn ? c.color : "#888",
                                minWidth: 32,
                                textAlign: "right",
                              }}
                            >
                              {count.toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* HEATMAP with master toggle */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#c4c4cc",
                        textTransform: "uppercase",
                        letterSpacing: "1.5px",
                        fontWeight: 700,
                      }}
                    >
                      Heatmap
                    </span>
                    <span
                      onClick={() => setHeatOn(!heatOn)}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        background: heatOn ? accent : "rgba(255,255,255,0.08)",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 3px",
                        transition: "all .2s",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: heatOn ? "#fff" : "#666",
                          transform: heatOn
                            ? "translateX(16px)"
                            : "translateX(0)",
                          transition: "all .2s",
                        }}
                      />
                    </span>
                  </div>
                  {heatOn && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                        }}
                      >
                        {HEAT_MODES.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setHeatMode(m.id)}
                            style={{
                              ...B(
                                heatMode === m.id,
                                `rgb(${m.colors[3].join(",")})`,
                              ),
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "6px 12px",
                            }}
                          >
                            <span
                              style={{
                                width: 18,
                                height: 8,
                                borderRadius: 3,
                                background:
                                  heatMode === m.id
                                    ? `linear-gradient(90deg,rgb(${m.colors[1].join(",")}),rgb(${m.colors[3].join(",")}))`
                                    : "#555",
                                flexShrink: 0,
                              }}
                            />
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              color: "#d4d4d8",
                              fontWeight: 600,
                            }}
                          >
                            Intensity
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: "#e4e4e8",
                              fontWeight: 700,
                            }}
                          >
                            {Math.round(heatOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={heatOpacity * 100}
                          onChange={(e) => setHeatOpacity(e.target.value / 100)}
                          style={{ width: "100%", accentColor: accent }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Tooltip toggle */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#c4c4cc",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "1.5px",
                      fontWeight: 700,
                    }}
                  >
                    Options
                  </div>
                  <button
                    onClick={() => {
                      setShowTooltips(!showTooltips);
                      setTooltip(null);
                    }}
                    style={{
                      ...B(showTooltips, "#e4e4e8"),
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                    }}
                  >
                    <span>Click-to-inspect markers</span>
                    <span
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        background: showTooltips
                          ? "#e4e4e8"
                          : "rgba(255,255,255,0.08)",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 3px",
                        transition: "all .2s",
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: showTooltips ? "#08080c" : "#666",
                          transform: showTooltips
                            ? "translateX(16px)"
                            : "translateX(0)",
                          transition: "all .2s",
                        }}
                      />
                    </span>
                  </button>
                </div>
              </div>
            )}

            {tab === "players" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {selPlayer && (
                  <button
                    onClick={() => setSelPlayer(null)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,59,59,0.3)",
                      background: "rgba(255,59,59,0.08)",
                      color: "#ff6b6b",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      marginBottom: 8,
                      fontWeight: 600,
                    }}
                  >
                    ✕ Clear selection
                  </button>
                )}
                <div
                  style={{ fontSize: 12, color: "#b0b0ba", marginBottom: 6 }}
                >
                  {playerList.length} players
                </div>
                {playerList.slice(0, 60).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPlayer(p.id)}
                    style={{
                      ...B(selPlayer === p.id, accent),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      {p.bot ? (
                        <svg width="18" height="18" viewBox="0 0 18 18">
                          <rect
                            x="3"
                            y="5"
                            width="12"
                            height="10"
                            rx="2.5"
                            fill="#c48a30"
                            stroke="#e8b050"
                            strokeWidth="0.8"
                          />
                          <rect
                            x="5"
                            y="7.5"
                            width="3"
                            height="2.5"
                            fill="#ff3333"
                          />
                          <rect
                            x="10"
                            y="7.5"
                            width="3"
                            height="2.5"
                            fill="#ff3333"
                          />
                          <line
                            x1="9"
                            y1="5"
                            x2="9"
                            y2="2"
                            stroke="#e8b050"
                            strokeWidth="1.2"
                          />
                          <circle cx="9" cy="1.5" r="1.2" fill="#ff3333" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 18 18">
                          <circle
                            cx="9"
                            cy="5"
                            r="3"
                            fill="#00dcff"
                            stroke="#66eeff"
                            strokeWidth="0.8"
                          />
                          <line
                            x1="9"
                            y1="8"
                            x2="9"
                            y2="13"
                            stroke="#66eeff"
                            strokeWidth="1"
                          />
                          <line
                            x1="6"
                            y1="10"
                            x2="12"
                            y2="10"
                            stroke="#66eeff"
                            strokeWidth="1"
                          />
                          <line
                            x1="9"
                            y1="13"
                            x2="7"
                            y2="16.5"
                            stroke="#66eeff"
                            strokeWidth="1"
                          />
                          <line
                            x1="9"
                            y1="13"
                            x2="11"
                            y2="16.5"
                            stroke="#66eeff"
                            strokeWidth="1"
                          />
                        </svg>
                      )}
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {p.bot ? `Bot ${p.id}` : p.id.slice(0, 12) + "…"}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "flex",
                        gap: 8,
                        flexShrink: 0,
                        fontSize: 11,
                      }}
                    >
                      {p.kills > 0 && (
                        <span style={{ color: "#ff2d2d", fontWeight: 700 }}>
                          ⚔{p.kills}
                        </span>
                      )}
                      {p.deaths > 0 && (
                        <span style={{ color: "#c06bff", fontWeight: 700 }}>
                          💀{p.deaths}
                        </span>
                      )}
                      <span style={{ color: "#999" }}>{p.n}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {tab === "matches" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <button
                  onClick={() => selectMatch("all")}
                  style={{
                    ...B(selMatch === "all", "#d4d4d8"),
                    marginBottom: 4,
                  }}
                >
                  All Matches ({fMatches.length})
                </button>
                {fMatches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectMatch(m.id)}
                    style={{
                      ...B(selMatch === m.id, accent),
                      padding: "8px 12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 3,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 12 }}>
                        {m.id.slice(0, 8)}
                      </span>
                      <span style={{ color: "#b0b0ba", fontSize: 10 }}>
                        {m.date.slice(5)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        fontSize: 11,
                        color: "#d4d4d8",
                      }}
                    >
                      <span>🧑 {m.humans}</span>
                      <span>🤖 {m.bots}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CENTER: MAP */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "relative",
              width: mapSz,
              height: mapSz,
              borderRadius: 10,
              overflow: "hidden",
              border: `1px solid ${accent}15`,
              boxShadow: `0 0 60px ${accent}08`,
            }}
          >
            <canvas
              ref={mainCanvasRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onClick={handleCanvasClick}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                cursor:
                  zoom > 1.01
                    ? isPanning.current
                      ? "grabbing"
                      : "grab"
                    : "crosshair",
              }}
            />

            {/* Tooltip */}
            {tooltip && (
              <div
                style={{
                  position: "absolute",
                  left: tooltip.x + 10,
                  top: tooltip.y - 10,
                  zIndex: 30,
                  background: "rgba(0,0,0,0.85)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 11,
                  color: "#e4e4e8",
                  pointerEvents: "none",
                  maxWidth: 220,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: EVT[tooltip.evt.evt]?.color || "#fff",
                    marginBottom: 4,
                  }}
                >
                  {EVT[tooltip.evt.evt]?.label || tooltip.evt.evt}
                </div>
                <div style={{ color: "#b0b0ba" }}>
                  Match: {tooltip.evt.mid?.slice(0, 8)}
                </div>
                <div style={{ color: "#b0b0ba" }}>
                  Player: {tooltip.evt.uid?.slice(0, 12)}
                  {tooltip.evt.bot ? " (Bot)" : ""}
                </div>
                <div style={{ color: "#999" }}>Date: {tooltip.evt.date}</div>
              </div>
            )}

            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 20,
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(6px)",
                padding: "4px 12px",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1px",
                color: accent,
                border: `1px solid ${accent}25`,
              }}
            >
              {selMap.toUpperCase()}
            </div>
            {isSingleMatch && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  zIndex: 20,
                  background: "rgba(0,0,0,0.65)",
                  backdropFilter: "blur(6px)",
                  padding: "4px 12px",
                  borderRadius: 5,
                  fontSize: 11,
                  color: "#d4d4d8",
                  border: "1px solid rgba(255,255,255,0.12)",
                  fontWeight: 600,
                }}
              >
                Match: {selMatch.slice(0, 8)}
              </div>
            )}

            <div
              style={{
                position: "absolute",
                bottom: 12,
                right: 12,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <button
                onClick={() => {
                  const nz = Math.min(6, zoom * 1.25);
                  const ctr = mapSz / (2 * zoom);
                  const nctr = mapSz / (2 * nz);
                  const cv = clampView(
                    viewX + (ctr - nctr),
                    viewY + (ctr - nctr),
                    nz,
                  );
                  setViewX(cv.x);
                  setViewY(cv.y);
                  setZoom(nz);
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(0,0,0,0.6)",
                  color: "#d4d4d8",
                  cursor: "pointer",
                  fontSize: 18,
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +
              </button>
              <button
                onClick={() => {
                  const nz = Math.max(1, zoom / 1.25);
                  if (nz <= 1.01) {
                    setZoom(1);
                    setViewX(0);
                    setViewY(0);
                  } else {
                    const ctr = mapSz / (2 * zoom);
                    const nctr = mapSz / (2 * nz);
                    const cv = clampView(
                      viewX + (ctr - nctr),
                      viewY + (ctr - nctr),
                      nz,
                    );
                    setViewX(cv.x);
                    setViewY(cv.y);
                    setZoom(nz);
                  }
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(0,0,0,0.6)",
                  color: "#d4d4d8",
                  cursor: "pointer",
                  fontSize: 18,
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                −
              </button>
              {zoom > 1.05 && (
                <button
                  onClick={resetView}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(0,0,0,0.6)",
                    color: "#d4d4d8",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ↺
                </button>
              )}
            </div>
            {zoom > 1.05 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 12,
                  zIndex: 20,
                  background: "rgba(0,0,0,0.6)",
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#d4d4d8",
                  fontWeight: 600,
                  pointerEvents: "none",
                }}
              >
                {zoom.toFixed(1)}×
              </div>
            )}
          </div>

          {/* PLAYBACK */}
          <div
            style={{
              width: mapSz,
              marginTop: 12,
              background: "rgba(255,255,255,0.03)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <button
              onClick={() => {
                if (playing) setPlaying(false);
                else {
                  if (progress >= 1) setProgress(0);
                  setPlaying(true);
                }
              }}
              style={{
                width: 34,
                height: 34,
                borderRadius: 6,
                border: `1px solid ${playing ? "#ff3b3b40" : "rgba(255,255,255,0.12)"}`,
                background: playing
                  ? "rgba(255,59,59,0.12)"
                  : "rgba(255,255,255,0.05)",
                color: playing ? "#ff3b3b" : "#d4d4d8",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontFamily: "inherit",
              }}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(progress * 1000)}
                onChange={(e) => setProgress(e.target.value / 1000)}
                style={{ width: "100%", accentColor: accent }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "#d4d4d8",
                  fontWeight: 600,
                }}
              >
                <span>{Math.max(0, Math.round(progress * 100))}% timeline</span>
                <span>{visEvents.length.toLocaleString()} visible</span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 2,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 6,
                padding: 2,
              }}
            >
              {[1, 2, 5, 10].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    fontFamily: "inherit",
                    fontWeight: 700,
                    background:
                      speed === s ? "rgba(255,255,255,0.12)" : "transparent",
                    color: speed === s ? "#e4e4e8" : "#999",
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setProgress(0);
                setPlaying(false);
              }}
              style={{
                padding: "5px 8px",
                borderRadius: 5,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "#d4d4d8",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              ↺
            </button>
          </div>
          {!isSingleMatch && !playing && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "#999",
                fontWeight: 500,
              }}
            >
              💡 Select a match to see full detail · Scroll to zoom
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            padding: 12,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#c4c4cc",
                textTransform: "uppercase",
                letterSpacing: "1px",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Legend
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#e4e4e8",
                }}
              >
                <svg width="22" height="8" viewBox="0 0 22 8">
                  <line
                    x1="0"
                    y1="4"
                    x2="15"
                    y2="4"
                    stroke="#00dcff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <polygon points="22,4 16,1 16,7" fill="#00dcff" />
                </svg>{" "}
                Human Path
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#d4d4d8",
                }}
              >
                <svg width="22" height="8" viewBox="0 0 22 8">
                  <line
                    x1="0"
                    y1="4"
                    x2="15"
                    y2="4"
                    stroke="#d4943a"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                  />
                  <polygon points="22,4 16,1 16,7" fill="#d4943a" />
                </svg>{" "}
                Bot Path
              </div>
              <div
                style={{
                  height: 1,
                  background: "rgba(255,255,255,0.06)",
                  margin: "2px 0",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#e4e4e8",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <polygon points="7,1 13,7 7,13 1,7" fill="#ff2d2d" />
                </svg>{" "}
                PvP Kill
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#e4e4e8",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <polygon points="7,1 13,7 7,13 1,7" fill="#ff6b8a" />
                </svg>{" "}
                PvP Death
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#e4e4e8",
                }}
              >
                <svg width="14" height="14">
                  <circle cx="7" cy="7" r="6" fill="#ff9500" />
                </svg>{" "}
                Bot Kill
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#e4e4e8",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <polygon
                    points="7,1 13,4 13,10 7,13 1,10 1,4"
                    fill="#22d68a"
                  />
                </svg>{" "}
                Killed by Bot
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#e4e4e8",
                }}
              >
                <StormSVG size={14} /> Storm Death
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#e4e4e8",
                }}
              >
                <svg width="14" height="14">
                  <rect
                    x="1"
                    y="1"
                    width="12"
                    height="12"
                    rx="1"
                    fill="#ffd23f"
                  />
                </svg>{" "}
                Loot Pickup
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              color: "#c4c4cc",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              fontWeight: 700,
            }}
          >
            Map Totals
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}
          >
            {[
              { l: "Matches", v: stats.matches, c: accent },
              { l: "Players", v: stats.players, c: "#00dcff" },
              { l: "Kills", v: stats.kills, c: "#ff2d2d" },
              { l: "Deaths", v: stats.deaths, c: "#c06bff" },
              { l: "Storm", v: stats.storm, c: "#c06bff" },
              { l: "Loot", v: stats.loot, c: "#ffd23f" },
            ].map((s) => (
              <div
                key={s.l}
                style={{
                  padding: "8px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "#b0b0ba",
                    textTransform: "uppercase",
                    letterSpacing: ".5px",
                    fontWeight: 600,
                    marginBottom: 2,
                  }}
                >
                  {s.l}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: s.c,
                    lineHeight: 1,
                  }}
                >
                  {s.v}
                </div>
              </div>
            ))}
          </div>
          {stats.kills > 0 && stats.deaths > 0 && (
            <div
              style={{
                padding: "8px",
                borderRadius: 6,
                background: "rgba(255,59,59,0.04)",
                border: "1px solid rgba(255,59,59,0.1)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#d4d4d8",
                  textTransform: "uppercase",
                  letterSpacing: ".5px",
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                K/D Ratio
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#ff2d2d",
                  lineHeight: 1,
                }}
              >
                {(stats.kills / stats.deaths).toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
