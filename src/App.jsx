import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   LILA BLACK — Player Journey Visualizer  v6
   • Big directional arrows on trails
   • Scroll zoom + drag pan on map
   • Smooth (blurred) heatmap
   • Default: heatmap + trails only, markers OFF
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

const TRAIL = {
  human: { r: 0, g: 220, b: 255 },
  bot: { r: 212, g: 148, b: 58 },
};

const EVT = {
  Kill: { color: "#ff2d2d", shape: "diamond", label: "PvP Kill" },
  Killed: { color: "#ff6b8a", shape: "diamond", label: "PvP Death" },
  BotKill: { color: "#ff9500", shape: "circle", label: "Bot Kill" },
  BotKilled: { color: "#22d68a", shape: "hexagon", label: "Killed by Bot" },
  KilledByStorm: { color: "#44bbff", shape: "storm", label: "Storm Death" },
  Loot: { color: "#ffd23f", shape: "square", label: "Loot Pickup" },
  Position: { color: "#00dcff", shape: "dot", label: "Movement" },
  BotPosition: { color: "#d4943a", shape: "dot", label: "Bot Movement" },
};

const HEAT_MODES = [
  {
    id: "combat",
    label: "Combat Zones",
    events: ["Kill", "BotKill", "Killed", "BotKilled", "KilledByStorm"],
    colors: [
      "rgba(255,45,45,0)",
      "rgba(255,60,30,0.3)",
      "rgba(255,100,40,0.6)",
      "rgba(255,160,60,0.85)",
      "rgba(255,240,120,1)",
    ],
  },
  {
    id: "traffic",
    label: "Player Traffic",
    events: ["Position", "BotPosition"],
    colors: [
      "rgba(0,220,255,0)",
      "rgba(0,220,255,0.25)",
      "rgba(60,240,255,0.5)",
      "rgba(140,255,255,0.75)",
      "rgba(230,255,255,1)",
    ],
  },
  {
    id: "loot",
    label: "Loot Density",
    events: ["Loot"],
    colors: [
      "rgba(255,210,63,0)",
      "rgba(255,210,63,0.25)",
      "rgba(255,220,80,0.5)",
      "rgba(255,240,120,0.75)",
      "rgba(255,255,200,1)",
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
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const mx = (x1 + x2) / 2,
    my = (y1 + y2) / 2;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size * 1.2, 0);
  ctx.lineTo(-size * 0.8, -size * 0.7);
  ctx.lineTo(-size * 0.2, 0);
  ctx.lineTo(-size * 0.8, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStorm(ctx, px, py, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const t = i / 28,
      r = size * (1 - t * 0.55);
    const a = t * Math.PI * 3.5 - Math.PI / 2;
    const sx = px + Math.cos(a) * r,
      sy = py - t * size * 2 + size * 0.6;
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py - size * 1.0, size * 0.3, 0, Math.PI * 2);
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
    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(px, py - sz * 1.7, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function buildHeat(evts, mode, mapId, sz) {
  const m = HEAT_MODES.find((h) => h.id === mode);
  if (!m) return null;
  const gs = Math.ceil(sz / 3);
  const grid = new Float32Array(gs * gs);
  let peak = 0;
  const R = 8;
  for (const e of evts) {
    if (!m.events.includes(e.evt)) continue;
    const [px, py] = w2p(e.x, e.z, mapId, sz);
    const gx = Math.floor(px / 3),
      gy = Math.floor(py / 3);
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
  return { grid, gs, peak, colors: m.colors };
}

// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selMap, setSelMap] = useState("AmbroseValley");
  const [selDate, setSelDate] = useState("all");
  const [selMatch, setSelMatch] = useState("all");
  const [showBots, setShowBots] = useState(true);
  // DEFAULT: markers OFF — only heatmap + trails on load
  const [activeEvts, setActiveEvts] = useState(
    new Set(["Position", "BotPosition"]),
  );
  const [heatMode, setHeatMode] = useState("combat");
  const [heatOpacity, setHeatOpacity] = useState(0.8);
  const [selPlayer, setSelPlayer] = useState(null);
  const [tab, setTab] = useState("filters");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mapSz, setMapSz] = useState(620);

  // ZOOM + PAN state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const animRef = useRef(null);
  const trailRef = useRef(null),
    eventRef = useRef(null),
    heatRef = useRef(null),
    iconRef = useRef(null);
  const containerRef = useRef(null),
    mapWrapRef = useRef(null);

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

  // Zoom handler
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = mapWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => {
      const nz = Math.min(6, Math.max(1, z * delta));
      // Adjust pan to zoom toward mouse position
      const scale = nz / z;
      setPanX((px) => (px - mx) * scale + mx);
      setPanY((py) => (py - my) * scale + my);
      return nz;
    });
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      if (zoom <= 1) return;
      setDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    },
    [zoom, panX, panY],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!dragging) return;
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    },
    [dragging, dragStart],
  );

  const handleMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  const resetZoom = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

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
        if (!showBots && e.bot) return false;
        if (e.evt === "BotPosition") {
          if (!showBots) return false;
        } else if (!activeEvts.has(e.evt)) return false;
        if (selPlayer && e.uid !== selPlayer) return false;
        return true;
      }),
    [safe.events, selMap, selDate, selMatch, showBots, activeEvts, selPlayer],
  );

  const timeRange = useMemo(() => {
    if (fEvents.length === 0) return [0, 1];
    let mn = Infinity,
      mx = -Infinity;
    for (const e of fEvents) {
      if (e.ts < mn) mn = e.ts;
      if (e.ts > mx) mx = e.ts;
    }
    return [mn, mx];
  }, [fEvents]);
  const cutTs = timeRange[0] + (timeRange[1] - timeRange[0]) * progress;

  const visEvents = useMemo(() => {
    if (!playing && progress === 0) return fEvents;
    if (!playing && progress >= 1) return fEvents;
    return fEvents.filter((e) => e.ts <= cutTs);
  }, [fEvents, playing, progress, cutTs]);

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

  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    let last = null;
    const tick = (t) => {
      if (last !== null) {
        setProgress((p) => {
          const np = p + ((t - last) / 1000) * 0.025 * speed;
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

  // ═══ CANVAS: TRAILS + BIG DIRECTIONAL ARROWS ═══
  useEffect(() => {
    const c = trailRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    c.width = mapSz;
    c.height = mapSz;
    ctx.clearRect(0, 0, mapSz, mapSz);
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const p = (i / 10) * mapSz;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, mapSz);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(mapSz, p);
      ctx.stroke();
    }

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
      const t = isBot ? TRAIL.bot : TRAIL.human;
      const baseAlpha = isSel ? 0.95 : isBot ? 0.4 : 0.6;
      ctx.lineWidth = isSel ? 3.5 : isBot ? 1.5 : 2.5;
      ctx.setLineDash(isBot ? [5, 6] : []);
      ctx.lineCap = "round";

      const pts = s.map((e) => w2p(e.x, e.z, selMap, mapSz));
      for (let i = 1; i < pts.length; i++) {
        const frac = i / (pts.length - 1);
        const alpha = baseAlpha * (0.45 + 0.55 * frac);
        ctx.strokeStyle = `rgba(${t.r},${t.g},${t.b},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // BIG directional arrows every ~4 segments
      const interval = Math.max(3, Math.floor(pts.length / 7));
      for (let i = interval; i < pts.length; i += interval) {
        const [x1, y1] = pts[i - 1],
          [x2, y2] = pts[i];
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        if (dist < 4) continue;
        const frac = i / (pts.length - 1);
        const aa = baseAlpha * (0.7 + 0.3 * frac);
        const bright = `rgba(${Math.min(255, t.r + 50)},${Math.min(255, t.g + 50)},${Math.min(255, t.b + 50)},${aa})`;
        // Arrow size: 8-12px depending on selection
        drawArrow(ctx, x1, y1, x2, y2, bright, isSel ? 12 : isBot ? 8 : 10);
      }
    }
  }, [visEvents, selMap, mapSz, selPlayer]);

  // ═══ CANVAS: EVENT MARKERS ═══
  useEffect(() => {
    const c = eventRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    c.width = mapSz;
    c.height = mapSz;
    ctx.clearRect(0, 0, mapSz, mapSz);
    for (const e of visEvents) {
      if (e.evt === "Position" || e.evt === "BotPosition") continue;
      const cfg = EVT[e.evt];
      if (!cfg) continue;
      const [px, py] = w2p(e.x, e.z, selMap, mapSz);
      const sz = isSingleMatch ? 7 : 5;
      let sc = 1;
      if (playing) {
        const span = (timeRange[1] - timeRange[0]) * 0.02 || 1,
          age = (cutTs - e.ts) / span;
        if (age >= 0 && age < 1) {
          sc = 1 + (1 - age) * 0.8;
          ctx.globalAlpha = 0.5 + 0.5 * (1 - age);
        }
      }
      drawMarker(ctx, px, py, cfg.shape, sz * sc, cfg.color);
      ctx.globalAlpha = 1;
    }
  }, [visEvents, selMap, mapSz, playing, cutTs, timeRange, isSingleMatch]);

  // ═══ CANVAS: PLAYER ICONS ═══
  useEffect(() => {
    const c = iconRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    c.width = mapSz;
    c.height = mapSz;
    ctx.clearRect(0, 0, mapSz, mapSz);
    if (!isSingleMatch && !playing) return;
    const latest = {};
    const ts = playing ? cutTs : Infinity;
    for (const e of fEvents) {
      if (e.ts > ts) continue;
      if (e.evt !== "Position" && e.evt !== "BotPosition") continue;
      if (!showBots && e.bot) continue;
      if (selPlayer && e.uid !== selPlayer) continue;
      if (!latest[e.uid] || e.ts > latest[e.uid].ts) latest[e.uid] = e;
    }
    for (const [uid, e] of Object.entries(latest)) {
      const [px, py] = w2p(e.x, e.z, selMap, mapSz);
      const isSel = selPlayer === uid;
      drawIcon(
        ctx,
        px,
        py,
        e.bot,
        e.bot ? 8 : 9,
        isSel ? 1 : e.bot ? 0.8 : 0.95,
      );
      if (isSel) {
        ctx.save();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [
    visEvents,
    fEvents,
    selMap,
    mapSz,
    playing,
    cutTs,
    showBots,
    selPlayer,
    isSingleMatch,
  ]);

  // ═══ CANVAS: SMOOTH HEATMAP ═══
  useEffect(() => {
    const c = heatRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    c.width = mapSz;
    c.height = mapSz;
    ctx.clearRect(0, 0, mapSz, mapSz);
    if (!heatMode) return;
    const h = buildHeat(allMapEvents, heatMode, selMap, mapSz);
    if (!h || h.peak === 0) return;
    const cs = mapSz / h.gs;
    // Draw to offscreen then blur
    const off = document.createElement("canvas");
    off.width = mapSz;
    off.height = mapSz;
    const octx = off.getContext("2d");
    for (let y = 0; y < h.gs; y++)
      for (let x = 0; x < h.gs; x++) {
        const v = h.grid[y * h.gs + x];
        if (v < 0.02) continue;
        const t = Math.min(1, v / h.peak);
        octx.fillStyle =
          h.colors[
            Math.min(Math.floor(t * (h.colors.length - 1)), h.colors.length - 1)
          ];
        octx.globalAlpha = heatOpacity * (0.3 + 0.7 * t);
        octx.fillRect(x * cs, y * cs, cs + 1, cs + 1);
      }
    octx.globalAlpha = 1;
    // Apply blur for smooth gradients
    ctx.filter = "blur(6px)";
    ctx.drawImage(off, 0, 0);
    ctx.filter = "none";
  }, [allMapEvents, heatMode, selMap, mapSz, heatOpacity]);

  const toggleEvt = (e) =>
    setActiveEvts((p) => {
      const n = new Set(p);
      n.has(e) ? n.delete(e) : n.add(e);
      return n;
    });
  const accent = MAP_CFG[selMap].accent;
  const B = (on, col = "#fff") => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid",
    borderColor: on ? col + "40" : "rgba(255,255,255,0.08)",
    background: on ? col + "12" : "transparent",
    color: on ? col : "#9a9aa6",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    transition: "all .12s",
    textAlign: "left",
  });

  const StormSVG = ({ size = 14, color = "#44bbff", active = true }) => (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <path
        d="M8 2C10 2 12 3 12 4.5C12 6 10 6 8 6.5C6 7 4 7 4 8.5C4 10 6 10 8 10.5C10 11 11 11 11 12.5"
        fill="none"
        stroke={active ? color : "#555"}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8" cy="2" r="1.5" fill={active ? color : "#555"} />
    </svg>
  );

  if (loading || !data)
    return (
      <div
        style={{
          fontFamily: "'IBM Plex Mono',monospace",
          background: "#08080c",
          color: "#9a9aa6",
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
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#e4e4e8",
              letterSpacing: "1px",
            }}
          >
            LILA BLACK
          </div>
        </div>
        {loadError ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#ff3b3b", fontSize: 14, marginBottom: 8 }}>
              Failed to load data
            </div>
            <div style={{ fontSize: 12, color: "#9a9aa6", maxWidth: 400 }}>
              Make sure{" "}
              <code style={{ color: "#c4c4cc" }}>public/game_data.json</code>{" "}
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
                border: "2px solid #444",
                borderTop: "2px solid #00dcff",
                borderRadius: "50%",
                animation: "spin .8s linear infinite",
              }}
            />
            <div style={{ fontSize: 12 }}>Loading player data...</div>
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
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: ".8px",
                color: "#f4f4f5",
              }}
            >
              LILA BLACK
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#9a9aa6",
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
                setProgress(0);
                setPlaying(false);
                resetZoom();
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
                color: selMap === n ? c.accent : "#9a9aa6",
                transition: "all .12s",
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
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "inherit",
              fontWeight: 500,
              background:
                selDate === "all" ? "rgba(255,255,255,0.1)" : "transparent",
              color: selDate === "all" ? "#e4e4e8" : "#9a9aa6",
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
                color: selDate === d ? "#e4e4e8" : "#777",
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
          <span style={{ fontSize: 11, color: "#c4c4cc" }}>
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
                  color: tab === t ? "#e4e4e8" : "#777",
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
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#9a9aa6",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "1.5px",
                      fontWeight: 700,
                    }}
                  >
                    Visibility
                  </div>
                  <button
                    onClick={() => setShowBots(!showBots)}
                    style={{
                      ...B(showBots, "#d4943a"),
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                    }}
                  >
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 18 18">
                        <rect
                          x="3"
                          y="5"
                          width="12"
                          height="10"
                          rx="2.5"
                          fill={showBots ? "#c48a30" : "#555"}
                          stroke={showBots ? "#e8b050" : "#777"}
                          strokeWidth="1"
                        />
                        <rect
                          x="5"
                          y="7.5"
                          width="3"
                          height="2.5"
                          rx="0.5"
                          fill={showBots ? "#ff3333" : "#888"}
                        />
                        <rect
                          x="10"
                          y="7.5"
                          width="3"
                          height="2.5"
                          rx="0.5"
                          fill={showBots ? "#ff3333" : "#888"}
                        />
                        <line
                          x1="9"
                          y1="5"
                          x2="9"
                          y2="2"
                          stroke={showBots ? "#e8b050" : "#777"}
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="9"
                          cy="1.5"
                          r="1.5"
                          fill={showBots ? "#ff3333" : "#888"}
                        />
                      </svg>
                      <span>Show Bots</span>
                    </span>
                    <span
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        background: showBots
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
                          background: showBots ? "#fff" : "#555",
                          transform: showBots
                            ? "translateX(16px)"
                            : "translateX(0)",
                          transition: "all .2s",
                        }}
                      />
                    </span>
                  </button>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#9a9aa6",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "1.5px",
                      fontWeight: 700,
                    }}
                  >
                    Event Types
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 3 }}
                  >
                    {Object.entries(EVT)
                      .filter(([k]) => {
                        if (k === "BotPosition") return false;
                        if (!showBots && k === "BotKilled") return false;
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
                                      fill={isOn ? c.color : "#555"}
                                    />
                                  </svg>
                                )}
                                {c.shape === "circle" && (
                                  <svg width="14" height="14">
                                    <circle
                                      cx="7"
                                      cy="7"
                                      r="6"
                                      fill={isOn ? c.color : "#555"}
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
                                      fill={isOn ? c.color : "#555"}
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
                                      fill={isOn ? c.color : "#555"}
                                    />
                                  </svg>
                                )}
                                {c.shape === "dot" && (
                                  <svg width="14" height="14">
                                    <circle
                                      cx="7"
                                      cy="7"
                                      r="5"
                                      fill={isOn ? c.color : "#555"}
                                    />
                                  </svg>
                                )}
                              </span>
                              <span>{c.label}</span>
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: isOn ? c.color : "#666",
                                minWidth: 28,
                                textAlign: "right",
                              }}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#9a9aa6",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "1.5px",
                      fontWeight: 700,
                    }}
                  >
                    Heatmap Overlay
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 3 }}
                  >
                    {HEAT_MODES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() =>
                          setHeatMode(heatMode === m.id ? null : m.id)
                        }
                        style={{
                          ...B(
                            heatMode === m.id,
                            m.colors[3].replace(/[^,]+\)/, "1)"),
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
                                ? `linear-gradient(90deg,${m.colors[1]},${m.colors[3]})`
                                : "#444",
                            flexShrink: 0,
                          }}
                        />
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  {heatMode && (
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#9a9aa6" }}>
                          Intensity
                        </span>
                        <span style={{ fontSize: 11, color: "#c4c4cc" }}>
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
                  )}
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
                  style={{ fontSize: 11, color: "#9a9aa6", marginBottom: 6 }}
                >
                  {playerList.length} players visible
                </div>
                {playerList.slice(0, 50).map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      setSelPlayer(selPlayer === p.id ? null : p.id)
                    }
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
                        <span style={{ color: "#ff2d2d", fontWeight: 600 }}>
                          ⚔{p.kills}
                        </span>
                      )}
                      {p.deaths > 0 && (
                        <span style={{ color: "#44bbff", fontWeight: 600 }}>
                          💀{p.deaths}
                        </span>
                      )}
                      <span style={{ color: "#777" }}>{p.n}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {tab === "matches" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <button
                  onClick={() => {
                    setSelMatch("all");
                    setSelPlayer(null);
                    setProgress(0);
                    setPlaying(false);
                  }}
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
                    onClick={() => {
                      setSelMatch(m.id);
                      setSelPlayer(null);
                      setProgress(0);
                      setPlaying(false);
                    }}
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
                      <span style={{ color: "#9a9aa6", fontSize: 10 }}>
                        {m.date.slice(5)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        fontSize: 11,
                        color: "#c4c4cc",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 18 18">
                          <circle cx="9" cy="5" r="3" fill="#00dcff" />
                          <line
                            x1="9"
                            y1="8"
                            x2="9"
                            y2="13"
                            stroke="#66eeff"
                            strokeWidth="1"
                          />
                        </svg>{" "}
                        {m.humans}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 18 18">
                          <rect
                            x="3"
                            y="5"
                            width="12"
                            height="10"
                            rx="2"
                            fill="#c48a30"
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
                        </svg>{" "}
                        {m.bots}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CENTER: MAP WITH ZOOM + PAN */}
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
            ref={mapWrapRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            style={{
              position: "relative",
              width: mapSz,
              height: mapSz,
              borderRadius: 10,
              overflow: "hidden",
              border: `1px solid ${accent}15`,
              boxShadow: `0 0 80px ${accent}08, 0 8px 40px rgba(0,0,0,0.5)`,
              cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default",
            }}
          >
            {/* Zoom/pan transform wrapper */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
                transformOrigin: "0 0",
                transition: dragging ? "none" : "transform 0.1s ease-out",
              }}
            >
              <img
                src={MAP_CFG[selMap].img}
                alt={selMap}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  zIndex: 0,
                  opacity: 0.5,
                }}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `radial-gradient(ellipse at 40% 40%, ${MAP_CFG[selMap].bg} 0%, #0a0a10 100%)`,
                  zIndex: -1,
                }}
              />
              <canvas
                ref={heatRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 1,
                  pointerEvents: "none",
                }}
              />
              <canvas
                ref={trailRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              />
              <canvas
                ref={eventRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 3,
                  pointerEvents: "none",
                }}
              />
              <canvas
                ref={iconRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 4,
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* Map overlay UI (not affected by zoom) */}
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
                  color: "#c4c4cc",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontWeight: 600,
                }}
              >
                Match: {selMatch.slice(0, 8)}
              </div>
            )}

            {/* Zoom controls */}
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
                onClick={() => setZoom((z) => Math.min(6, z * 1.3))}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.6)",
                  color: "#c4c4cc",
                  cursor: "pointer",
                  fontSize: 16,
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backdropFilter: "blur(4px)",
                }}
              >
                +
              </button>
              <button
                onClick={() => {
                  const nz = Math.max(1, zoom / 1.3);
                  setZoom(nz);
                  if (nz === 1) {
                    setPanX(0);
                    setPanY(0);
                  }
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.6)",
                  color: "#c4c4cc",
                  cursor: "pointer",
                  fontSize: 16,
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backdropFilter: "blur(4px)",
                }}
              >
                −
              </button>
              {zoom > 1 && (
                <button
                  onClick={resetZoom}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.6)",
                    color: "#c4c4cc",
                    cursor: "pointer",
                    fontSize: 11,
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  ↺
                </button>
              )}
            </div>
            {zoom > 1 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 12,
                  zIndex: 20,
                  background: "rgba(0,0,0,0.6)",
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 10,
                  color: "#9a9aa6",
                  backdropFilter: "blur(4px)",
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
                border: `1px solid ${playing ? "#ff3b3b40" : "rgba(255,255,255,0.1)"}`,
                background: playing
                  ? "rgba(255,59,59,0.12)"
                  : "rgba(255,255,255,0.05)",
                color: playing ? "#ff3b3b" : "#c4c4cc",
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
                  fontSize: 10,
                  color: "#9a9aa6",
                }}
              >
                <span>{Math.round(progress * 100)}% timeline</span>
                <span style={{ color: "#c4c4cc" }}>
                  {visEvents.length.toLocaleString()} events visible
                </span>
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
                      speed === s ? "rgba(255,255,255,0.1)" : "transparent",
                    color: speed === s ? "#e4e4e8" : "#777",
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
                border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent",
                color: "#9a9aa6",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              ↺
            </button>
          </div>
          {!isSingleMatch && !playing && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
              💡 Select a match → press ▶ to watch journeys animate · Scroll to
              zoom
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
                fontSize: 10,
                color: "#9a9aa6",
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
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <circle
                    cx="9"
                    cy="4.5"
                    r="2.5"
                    fill="#00dcff"
                    stroke="#66eeff"
                    strokeWidth="0.8"
                  />
                  <line
                    x1="9"
                    y1="7"
                    x2="9"
                    y2="12"
                    stroke="#66eeff"
                    strokeWidth="1"
                  />
                  <line
                    x1="6.5"
                    y1="9"
                    x2="11.5"
                    y2="9"
                    stroke="#66eeff"
                    strokeWidth="1"
                  />
                  <line
                    x1="9"
                    y1="12"
                    x2="7"
                    y2="15"
                    stroke="#66eeff"
                    strokeWidth="1"
                  />
                  <line
                    x1="9"
                    y1="12"
                    x2="11"
                    y2="15"
                    stroke="#66eeff"
                    strokeWidth="1"
                  />
                </svg>
                Human Player
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#c4c4cc",
                }}
              >
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
                  <rect x="5" y="7.5" width="3" height="2.5" fill="#ff3333" />
                  <rect x="10" y="7.5" width="3" height="2.5" fill="#ff3333" />
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
                Bot (AI)
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
                <svg width="22" height="6" viewBox="0 0 22 6">
                  <line
                    x1="0"
                    y1="3"
                    x2="15"
                    y2="3"
                    stroke="#00dcff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <polygon points="22,3 16,0 16,6" fill="#00dcff" />
                </svg>
                Human Path
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#c4c4cc",
                }}
              >
                <svg width="22" height="6" viewBox="0 0 22 6">
                  <line
                    x1="0"
                    y1="3"
                    x2="15"
                    y2="3"
                    stroke="#d4943a"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                  />
                  <polygon points="22,3 16,0 16,6" fill="#d4943a" />
                </svg>
                Bot Path
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 10,
              color: "#9a9aa6",
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
              { l: "Deaths", v: stats.deaths, c: "#44bbff" },
              { l: "Storm", v: stats.storm, c: "#44bbff" },
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
                    fontSize: 9,
                    color: "#9a9aa6",
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
                  fontSize: 9,
                  color: "#c4c4cc",
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
