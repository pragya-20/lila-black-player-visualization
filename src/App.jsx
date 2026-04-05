import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
const TRAIL_CLR = { human: [0, 220, 255], bot: [212, 148, 58] };
const ALL_MARKER_EVTS = [
  "Kill",
  "Killed",
  "BotKill",
  "BotKilled",
  "KilledByStorm",
  "Loot",
];
const EVT = {
  Kill: { color: "#ff2d2d", shape: "diamond", label: "PvP Kill" },
  Killed: { color: "#ff6b8a", shape: "diamond", label: "PvP Death" },
  BotKill: { color: "#ff9500", shape: "circle", label: "Bot Kill" },
  BotKilled: { color: "#22d68a", shape: "hexagon", label: "Killed by Bot" },
  KilledByStorm: { color: "#44bbff", shape: "storm", label: "Storm Death" },
  Loot: { color: "#ffd23f", shape: "square", label: "Loot Pickup" },
};
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
      [255, 250, 130],
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
      [200, 160, 30],
      [255, 210, 63],
      [255, 230, 100],
      [255, 245, 150],
      [255, 255, 210],
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
  const a = Math.atan2(y2 - y1, x2 - x1),
    mx = (x1 + x2) / 2,
    my = (y1 + y2) / 2;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size * 1.3, 0);
  ctx.lineTo(-size * 0.7, -size * 0.75);
  ctx.lineTo(-size * 0.15, 0);
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
  for (let i = 0; i < 28; i++) {
    const t = i / 28,
      r = size * (1 - t * 0.55),
      a = t * Math.PI * 3.5 - Math.PI / 2,
      sx = px + Math.cos(a) * r,
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
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selMap, setSelMap] = useState("AmbroseValley");
  const [selDate, setSelDate] = useState("all");
  const [selMatch, setSelMatch] = useState("all");
  const [selPlayer, setSelPlayer] = useState(null);
  const [tab, setTab] = useState("filters");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mapSz, setMapSz] = useState(620);
  const [showHumanTrails, setShowHumanTrails] = useState(false);
  const [showBotTrails, setShowBotTrails] = useState(false);
  const [activeEvts, setActiveEvts] = useState(new Set());
  const [userDisabled, setUserDisabled] = useState(new Set());
  const [heatMode, setHeatMode] = useState("traffic");
  const [heatOpacity, setHeatOpacity] = useState(0.85);
  const [zoom, setZoom] = useState(1);
  const [camX, setCamX] = useState(0);
  const [camY, setCamY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ sx: 0, sy: 0, cx: 0, cy: 0 });
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
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = mainCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    setZoom((pz) => {
      const f = e.deltaY > 0 ? 0.92 : 1.08,
        nz = Math.min(8, Math.max(1, pz * f)),
        r = nz / pz;
      setCamX((cx) => (cx - mx) * r + mx);
      setCamY((cy) => (cy - my) * r + my);
      return nz;
    });
  }, []);
  const handleMouseDown = useCallback(
    (e) => {
      if (zoom <= 1) return;
      e.preventDefault();
      setDragging(true);
      dragRef.current = { sx: e.clientX, sy: e.clientY, cx: camX, cy: camY };
    },
    [zoom, camX, camY],
  );
  const handleMouseMove = useCallback(
    (e) => {
      if (!dragging) return;
      setCamX(dragRef.current.cx + e.clientX - dragRef.current.sx);
      setCamY(dragRef.current.cy + e.clientY - dragRef.current.sy);
    },
    [dragging],
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
  const resetView = useCallback(() => {
    setZoom(1);
    setCamX(0);
    setCamY(0);
  }, []);
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
      allMapEvents.filter((e) => {
        const isPos = e.evt === "Position" || e.evt === "BotPosition";
        if (isPos) {
          if (e.bot && !showBotTrails) return false;
          if (!e.bot && !showHumanTrails) return false;
        } else {
          if (!activeEvts.has(e.evt)) return false;
          if ((e.evt === "BotKill" || e.evt === "BotKilled") && !showBotTrails)
            return false;
        }
        if (selPlayer && e.uid !== selPlayer) return false;
        return true;
      }),
    [allMapEvents, showHumanTrails, showBotTrails, activeEvts, selPlayer],
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
  const selectMatch = useCallback(
    (mid) => {
      setSelMatch(mid);
      setSelPlayer(null);
      setProgress(0);
      setPlaying(false);
      if (mid !== "all") {
        setShowHumanTrails(true);
        setShowBotTrails(true);
        setActiveEvts(
          new Set(ALL_MARKER_EVTS.filter((e) => !userDisabled.has(e))),
        );
      } else {
        setShowHumanTrails(false);
        setShowBotTrails(false);
        setActiveEvts(new Set());
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
  const toggleEvt = useCallback((evt) => {
    setActiveEvts((prev) => {
      const n = new Set(prev);
      if (n.has(evt)) {
        n.delete(evt);
        setUserDisabled((ud) => new Set([...ud, evt]));
      } else {
        n.add(evt);
        setUserDisabled((ud) => {
          const nu = new Set(ud);
          nu.delete(evt);
          return nu;
        });
      }
      return n;
    });
  }, []);
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
  // ═══ SINGLE CANVAS RENDER ═══
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const sz = mapSz;
    canvas.width = sz;
    canvas.height = sz;
    ctx.clearRect(0, 0, sz, sz);
    ctx.save();
    ctx.translate(camX, camY);
    ctx.scale(zoom, zoom);
    // BG
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(-camX / zoom, -camY / zoom, sz / zoom + 10, sz / zoom + 10);
    // Minimap
    if (mapImgRef.current) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(mapImgRef.current, 0, 0, sz, sz);
      ctx.globalAlpha = 1;
    }
    // TRAILS
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
      const tc = isBot ? TRAIL_CLR.bot : TRAIL_CLR.human;
      const bA = isSel ? 0.95 : isBot ? 0.4 : 0.6;
      ctx.lineWidth = (isSel ? 3.5 : isBot ? 1.5 : 2.5) / zoom;
      ctx.setLineDash(isBot ? [5 / zoom, 6 / zoom] : []);
      ctx.lineCap = "round";
      const pts = s.map((e) => w2p(e.x, e.z, selMap, sz));
      for (let i = 1; i < pts.length; i++) {
        const f = i / (pts.length - 1),
          a = bA * (0.45 + 0.55 * f);
        ctx.strokeStyle = `rgba(${tc[0]},${tc[1]},${tc[2]},${a})`;
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
        if (Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) < 3) continue;
        const f = i / (pts.length - 1),
          aa = bA * (0.7 + 0.3 * f);
        const bc = `rgba(${Math.min(255, tc[0] + 50)},${Math.min(255, tc[1] + 50)},${Math.min(255, tc[2] + 50)},${aa})`;
        drawArrow(
          ctx,
          x1,
          y1,
          x2,
          y2,
          bc,
          (isSel ? 12 : isBot ? 8 : 10) / zoom,
        );
      }
    }
    // HEATMAP (above trails)
    if (heatMode) {
      const hm = HEAT_MODES.find((h) => h.id === heatMode);
      if (hm) {
        const gs = Math.ceil(sz / 3),
          grid = new Float32Array(gs * gs);
        let peak = 0;
        const R = 8;
        for (const e of allMapEvents) {
          if (!hm.events.includes(e.evt)) continue;
          const [px, py] = w2p(e.x, e.z, selMap, sz);
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
              grid[idx] += Math.exp((-d * d) / (R * 0.5));
              if (grid[idx] > peak) peak = grid[idx];
            }
        }
        if (peak > 0) {
          const off = document.createElement("canvas");
          off.width = sz;
          off.height = sz;
          const oc = off.getContext("2d");
          const cs = sz / gs;
          for (let y = 0; y < gs; y++)
            for (let x = 0; x < gs; x++) {
              const v = grid[y * gs + x];
              if (v < 0.01) continue;
              const t = Math.min(1, v / peak),
                intensity = Math.pow(t, 0.5);
              const ci = Math.min(
                Math.floor(intensity * (hm.colors.length - 1)),
                hm.colors.length - 1,
              );
              const rgb = hm.colors[ci];
              oc.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
              oc.globalAlpha = heatOpacity * (0.2 + 0.8 * intensity);
              oc.fillRect(x * cs, y * cs, cs + 1, cs + 1);
            }
          oc.globalAlpha = 1;
          ctx.filter = `blur(${8 / zoom}px)`;
          ctx.drawImage(off, 0, 0);
          ctx.filter = "none";
        }
      }
    }
    // MARKERS
    for (const e of visEvents) {
      if (e.evt === "Position" || e.evt === "BotPosition") continue;
      const cfg = EVT[e.evt];
      if (!cfg) continue;
      const [px, py] = w2p(e.x, e.z, selMap, sz);
      const msz = (isSingleMatch ? 7 : 5) / Math.sqrt(zoom);
      let sc = 1;
      if (playing) {
        const span = (timeRange[1] - timeRange[0]) * 0.02 || 1,
          age = (cutTs - e.ts) / span;
        if (age >= 0 && age < 1) {
          sc = 1 + (1 - age) * 0.8;
          ctx.globalAlpha = 0.5 + 0.5 * (1 - age);
        }
      }
      drawMarker(ctx, px, py, cfg.shape, msz * sc, cfg.color);
      ctx.globalAlpha = 1;
    }
    // ICONS
    if (isSingleMatch || playing) {
      const latest = {};
      const tsL = playing ? cutTs : Infinity;
      for (const e of fEvents) {
        if (e.ts > tsL) continue;
        if (e.evt !== "Position" && e.evt !== "BotPosition") continue;
        if (!latest[e.uid] || e.ts > latest[e.uid].ts) latest[e.uid] = e;
      }
      for (const [uid, e] of Object.entries(latest)) {
        const [px, py] = w2p(e.x, e.z, selMap, sz);
        const isSel = selPlayer === uid;
        const isz = (e.bot ? 8 : 9) / Math.sqrt(zoom);
        drawIcon(ctx, px, py, e.bot, isz, isSel ? 1 : e.bot ? 0.8 : 0.95);
        if (isSel) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2 / zoom;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(px, py, 14 / zoom, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
  }, [
    visEvents,
    fEvents,
    allMapEvents,
    selMap,
    mapSz,
    selPlayer,
    zoom,
    camX,
    camY,
    playing,
    cutTs,
    timeRange,
    isSingleMatch,
    heatMode,
    heatOpacity,
    imgLoaded,
  ]);

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
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e4e4e8" }}>
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
                selectMatch("all");
                resetView();
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
              selectMatch("all");
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
                selectMatch("all");
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
                            stroke={showHumanTrails ? "#00dcff" : "#555"}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <polygon
                            points="22,3 16,0 16,6"
                            fill={showHumanTrails ? "#00dcff" : "#555"}
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
                            background: showHumanTrails ? "#fff" : "#555",
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
                            stroke={showBotTrails ? "#d4943a" : "#555"}
                            strokeWidth="2"
                            strokeDasharray="4 3"
                            strokeLinecap="round"
                          />
                          <polygon
                            points="22,3 16,0 16,6"
                            fill={showBotTrails ? "#d4943a" : "#555"}
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
                            background: showBotTrails ? "#fff" : "#555",
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
                      <span>🧑 {m.humans}</span>
                      <span>🤖 {m.bots}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* CENTER MAP */}
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
              boxShadow: `0 0 80px ${accent}08,0 8px 40px rgba(0,0,0,0.5)`,
            }}
          >
            <canvas
              ref={mainCanvasRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              style={{
                width: "100%",
                height: "100%",
                cursor:
                  zoom > 1 ? (dragging ? "grabbing" : "grab") : "crosshair",
              }}
            />
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
                pointerEvents: "none",
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
                  pointerEvents: "none",
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
                onClick={() => setZoom((z) => Math.min(8, z * 1.4))}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.6)",
                  color: "#c4c4cc",
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
                onClick={() =>
                  setZoom((z) => {
                    const nz = Math.max(1, z / 1.4);
                    if (nz <= 1.05) {
                      setCamX(0);
                      setCamY(0);
                      return 1;
                    }
                    return nz;
                  })
                }
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.6)",
                  color: "#c4c4cc",
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
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.6)",
                    color: "#c4c4cc",
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
                  fontSize: 10,
                  color: "#9a9aa6",
                  pointerEvents: "none",
                }}
              >
                {zoom.toFixed(1)}×
              </div>
            )}
          </div>
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
                  {visEvents.length.toLocaleString()} visible
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
                </svg>{" "}
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
                </svg>{" "}
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
                </svg>{" "}
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
                </svg>{" "}
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
