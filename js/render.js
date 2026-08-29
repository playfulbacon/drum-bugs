// Top-down garden. Muted greens and browns, soft shapes, everything a bit damp.

import { COLS, ROWS, ripeness, canBuildNest } from './game.js';

export const layout = { u: 0, ox: 0, oy: 0, w: 0, h: 0 };

const C = {
  grass: '#2f4526',
  grassLo: '#26381f',
  grassHi: '#3b5730',
  rock: '#5b6058',
  rockHi: '#767c72',
  rockLo: '#3f443d',
  water: '#22485a',
  waterHi: '#3e7286',
  nest: '#5a4327',
  nestLo: '#33240f',
  berry: '#c2415c',
  berryHi: '#e8798c',
};

const BUG_COLORS = {
  cricket: { body: '#8fbc5a', dark: '#5b7d35', leg: '#4c6a2c' },
  ant:     { body: '#a85f3a', dark: '#6f3a20', leg: '#5d3019' },
  beetle:  { body: '#3b4658', dark: '#222b39', leg: '#1a2129' },
  termite: { body: '#d9cdb0', dark: '#a2926f', leg: '#8b7c5c' },
};

function hash(i) {
  let h = Math.imul(i | 0, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

let mottle = null;

export function computeLayout(w, h) {
  const u = Math.min((w - 32) / COLS, (h - 24) / ROWS);
  layout.u = u;
  layout.w = u * COLS;
  layout.h = u * ROWS;
  layout.ox = (w - layout.w) / 2;
  layout.oy = (h - layout.h) / 2;
  mottle = buildMottle(layout.w, layout.h);
}

// One baked texture across the whole garden. Because it ignores cell bounds,
// it stops the ground reading as a checkerboard of tiles.
function buildMottle(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  for (let i = 0; i < 260; i++) {
    const x = hash(i * 3 + 1) * w;
    const y = hash(i * 5 + 2) * h;
    const r = w * (0.015 + hash(i * 7 + 3) * 0.06);
    const light = hash(i * 11 + 4) > 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? 'rgba(140,180,100,0.07)' : 'rgba(0,0,0,0.09)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function cellFromPoint(px, py) {
  const x = Math.floor((px - layout.ox) / layout.u);
  const y = Math.floor((py - layout.oy) / layout.u);
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
  return { x, y };
}

export function cellCenter(x, y) {
  return {
    cx: layout.ox + (x + 0.5) * layout.u,
    cy: layout.oy + (y + 0.5) * layout.u,
  };
}

export function draw(g, state, view, time, teach) {
  g.fillStyle = '#0d140b';
  g.fillRect(0, 0, view.w, view.h);

  const u = layout.u;
  for (const cell of state.cells) drawGround(g, cell, u, time);
  if (mottle) g.drawImage(mottle, layout.ox, layout.oy, layout.w, layout.h);
  for (const cell of state.cells) drawFeature(g, cell, u);
  drawNests(g, state, u, time);

  // hovered cell
  if (state.hover && !teach) {
    const { cx, cy } = cellCenter(state.hover.x, state.hover.y);
    g.strokeStyle = 'rgba(220,240,190,0.28)';
    g.lineWidth = 2;
    g.strokeRect(cx - u / 2 + 1, cy - u / 2 + 1, u - 2, u - 2);
  }

  for (const cell of state.cells) {
    if (cell.bush) drawBush(g, state, cell, u, time);
    else if (cell.berry) drawBerry(g, cell.x, cell.y, u, time);
  }

  if (teach && teach.bug.type === 'termite') {
    const end = teach.preview.path[teach.preview.path.length - 1];
    const ok = canBuildNest(state, end.x, end.y);
    const { cx, cy } = cellCenter(end.x, end.y);
    g.save();
    g.strokeStyle = ok ? 'rgba(240,222,168,0.75)' : 'rgba(210,120,110,0.6)';
    g.lineWidth = Math.max(2, u * 0.05);
    g.setLineDash([u * 0.14, u * 0.11]);
    g.lineDashOffset = -time * 20;
    g.beginPath();
    g.arc(cx, cy, u * 0.46, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  if (teach) drawPreview(g, state, teach, u, time);

  for (const p of state.particles) drawParticle(g, p, time);
  for (const bug of state.bugs) drawBug(g, bug, u, time, state, teach);
}

// ---------------------------------------------------------------------------

// Every nest, with the active one — the one bugs crawl out of — lit up.
function drawNests(g, state, u, time) {
  state.nests.forEach((n, i) => {
    const { cx, cy } = cellCenter(n.x, n.y);
    const active = i === state.activeNest;
    const k = 0.5 + 0.5 * Math.sin(time * 2.2);
    g.save();
    g.strokeStyle = active
      ? `rgba(240,222,168,${(0.35 + k * 0.4).toFixed(3)})`
      : 'rgba(200,190,150,0.18)';
    g.lineWidth = Math.max(1.5, u * (active ? 0.05 : 0.03));
    g.setLineDash([u * 0.16, u * 0.13]);
    g.lineDashOffset = -time * (active ? 16 : 6);
    g.beginPath();
    g.arc(cx, cy, u * (active ? 0.52 + k * 0.03 : 0.48), 0, Math.PI * 2);
    g.stroke();
    g.restore();
  });
}

function drawGround(g, cell, u, time) {
  const { cx, cy } = cellCenter(cell.x, cell.y);
  const n = hash(cell.y * COLS + cell.x);
  const x0 = cx - u / 2;
  const y0 = cy - u / 2;

  if (cell.t === 'water') {
    g.fillStyle = C.water;
    g.fillRect(x0, y0, u, u);
    const k = 0.5 + 0.5 * Math.sin(time * 1.2 + n * 8);
    g.strokeStyle = `rgba(120,190,215,${(0.1 + k * 0.16).toFixed(3)})`;
    g.lineWidth = Math.max(1, u * 0.035);
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      g.ellipse(cx + (n - 0.5) * u * 0.3, cy - u * 0.16 + i * u * 0.3,
        u * 0.28, u * 0.07, 0, 0, Math.PI * 2);
      g.stroke();
    }
    return;
  }

  g.fillStyle = C.grass;
  g.fillRect(x0, y0, u, u);
  g.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < 4; i++) {
    const a = hash(cell.x * 31 + cell.y * 7 + i) * u;
    const b = hash(cell.x * 17 + cell.y * 23 + i) * u;
    g.fillRect(x0 + a, y0 + b, u * 0.05, u * 0.11);
  }
}

function drawFeature(g, cell, u) {
  if (cell.t !== 'rock' && cell.t !== 'nest') return;
  const { cx, cy } = cellCenter(cell.x, cell.y);

  if (cell.t === 'rock') {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(cx, cy + u * 0.3, u * 0.4, u * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.rock;
    g.beginPath();
    g.moveTo(cx - u * 0.4, cy + u * 0.3);
    g.lineTo(cx - u * 0.34, cy - u * 0.24);
    g.lineTo(cx + u * 0.1, cy - u * 0.38);
    g.lineTo(cx + u * 0.4, cy + u * 0.02);
    g.lineTo(cx + u * 0.22, cy + u * 0.34);
    g.closePath();
    g.fill();
    g.fillStyle = C.rockHi;
    g.beginPath();
    g.moveTo(cx - u * 0.34, cy - u * 0.24);
    g.lineTo(cx + u * 0.1, cy - u * 0.38);
    g.lineTo(cx - u * 0.06, cy - u * 0.06);
    g.closePath();
    g.fill();
  } else if (cell.t === 'nest') {
    g.fillStyle = C.nest;
    g.beginPath();
    g.ellipse(cx, cy, u * 0.44, u * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.nestLo;
    g.beginPath();
    g.ellipse(cx, cy + u * 0.03, u * 0.2, u * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(230,210,160,0.2)';
    g.lineWidth = Math.max(1, u * 0.03);
    g.beginPath();
    g.ellipse(cx, cy, u * 0.44, u * 0.4, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

// A bush shows what it is about to give you: a bud that swells as it ripens.
function drawBush(g, state, cell, u, time) {
  const { cx, cy } = cellCenter(cell.x, cell.y);
  g.fillStyle = '#243c1c';
  g.beginPath();
  g.ellipse(cx, cy + u * 0.08, u * 0.3, u * 0.22, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#31501f';
  for (let i = 0; i < 5; i++) {
    const a = hash(cell.x * 41 + cell.y * 13 + i) * Math.PI * 2;
    const d = hash(cell.x * 7 + cell.y * 29 + i) * u * 0.22;
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + u * 0.06 + Math.sin(a) * d * 0.6, u * 0.07, 0, Math.PI * 2);
    g.fill();
  }

  if (cell.berry) { drawBerry(g, cell.x, cell.y, u, time); return; }

  const k = ripeness(state, cell);
  if (k <= 0) return;
  g.globalAlpha = 0.35 + k * 0.6;
  g.fillStyle = k > 0.75 ? '#b7466099' : '#6f7a4d';
  g.beginPath();
  g.arc(cx, cy - u * 0.04, u * 0.05 + u * 0.1 * k, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}

function drawBerry(g, x, y, u, time) {
  const { cx, cy } = cellCenter(x, y);
  const bob = Math.sin(time * 2 + x * 1.7 + y) * u * 0.02;
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.beginPath();
  g.ellipse(cx, cy + u * 0.2, u * 0.15, u * 0.06, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.berry;
  g.beginPath();
  g.arc(cx, cy + bob, u * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.berryHi;
  g.beginPath();
  g.arc(cx - u * 0.05, cy + bob - u * 0.05, u * 0.055, 0, Math.PI * 2);
  g.fill();
}

function drawBug(g, bug, u, time, state, teach) {
  const { cx, cy } = cellCenter(bug.visX, bug.visY);
  const col = BUG_COLORS[bug.type];
  const s = u * (bug.type === 'termite' ? 0.42 : 0.34);
  const waiting = bug.phase > state.tick;
  const dimmed = !state.sections[bug.type].active || bug.dozing || waiting;
  const being = teach && teach.bug === bug;

  const since = time - bug.actAt;
  let pop = 1;
  if (since >= 0 && since < 0.2) pop = 1 + 0.28 * (1 - since / 0.2) * (bug.accented ? 1.6 : 1);

  g.save();
  g.globalAlpha = dimmed ? 0.4 : 1;
  g.translate(cx, cy);

  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(0, s * 0.5, s * 0.85, s * 0.3, 0, 0, Math.PI * 2);
  g.fill();

  g.rotate(bug.visDir);
  g.scale(pop, pop);

  const busy = bug.dozing || waiting ? 0 : 1;
  const wig = Math.sin(time * 11 + bug.visX) * 0.14 * busy;
  g.strokeStyle = col.leg;
  g.lineWidth = Math.max(1.2, u * 0.035);
  for (let i = -1; i <= 1; i++) {
    const p = Math.sin(time * 11 + i * 1.6) * s * 0.3 * busy;
    g.beginPath();
    g.moveTo(i * s * 0.34, -s * 0.1);
    g.lineTo(i * s * 0.34 + p * 0.4, -s * 0.75);
    g.moveTo(i * s * 0.34, s * 0.1);
    g.lineTo(i * s * 0.34 - p * 0.4, s * 0.75);
    g.stroke();
  }

  // abdomen + thorax, nose pointing +x (facing)
  g.fillStyle = col.dark;
  g.beginPath();
  g.ellipse(-s * 0.42, 0, s * 0.5, s * 0.4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = col.body;
  g.beginPath();
  g.ellipse(s * 0.12, 0, s * 0.55, s * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.beginPath();
  g.ellipse(s * 0.1, -s * 0.14, s * 0.4, s * 0.12, 0, 0, Math.PI * 2);
  g.fill();

  // head
  g.fillStyle = col.dark;
  g.beginPath();
  g.arc(s * 0.72, 0, s * 0.3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = col.dark;
  g.lineWidth = Math.max(1, u * 0.026);
  g.beginPath();
  g.moveTo(s * 0.9, -s * 0.14);
  g.lineTo(s * 1.3, -s * 0.42 + wig * s);
  g.moveTo(s * 0.9, s * 0.14);
  g.lineTo(s * 1.3, s * 0.42 - wig * s);
  g.stroke();

  if (bug.type === 'cricket') {
    g.strokeStyle = col.dark;
    g.lineWidth = Math.max(1.4, u * 0.04);
    g.beginPath();
    g.moveTo(-s * 0.5, -s * 0.3);
    g.lineTo(-s * 0.95, -s * 0.55);
    g.moveTo(-s * 0.5, s * 0.3);
    g.lineTo(-s * 0.95, s * 0.55);
    g.stroke();
  }

  g.restore();

  if (bug.carrying) {
    g.fillStyle = C.berry;
    g.beginPath();
    g.arc(cx, cy - s * 0.75, u * 0.13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.berryHi;
    g.beginPath();
    g.arc(cx - u * 0.04, cy - s * 0.75 - u * 0.04, u * 0.045, 0, Math.PI * 2);
    g.fill();
  }

  // waiting for the top of its phrase to come in
  if (waiting && !being) {
    const k = 0.5 + 0.5 * Math.sin(time * 5);
    g.strokeStyle = `rgba(224,201,138,${(0.3 + k * 0.45).toFixed(3)})`;
    g.lineWidth = Math.max(1.5, u * 0.04);
    g.setLineDash([u * 0.1, u * 0.09]);
    g.lineDashOffset = -time * 22;
    g.beginPath();
    g.arc(cx, cy, u * 0.42, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }

  if (bug.dozing && !waiting && !being) {
    g.fillStyle = 'rgba(190,200,170,0.5)';
    for (let i = 0; i < 3; i++) {
      const t2 = (time * 0.6 + i * 0.33) % 1;
      g.globalAlpha = (1 - t2) * 0.5;
      g.beginPath();
      g.arc(cx + s * 0.7 + t2 * u * 0.2, cy - s * 0.8 - t2 * u * 0.35, u * 0.035, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  if (being) {
    g.strokeStyle = 'rgba(250,230,150,0.85)';
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.lineDashOffset = -time * 18;
    g.beginPath();
    g.arc(cx, cy, u * 0.46, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
}

// ---------------------------------------------------------------------------

function drawPreview(g, state, teach, u, time) {
  const { path, closes } = teach.preview;
  if (!path || path.length < 2) return;

  const stroke = closes ? 'rgba(170,240,150,' : 'rgba(245,195,110,';

  g.save();

  // a dark backing so the path stays legible over grass and rock alike
  g.lineWidth = Math.max(5, u * 0.15);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  path.forEach((p, i) => {
    const { cx, cy } = cellCenter(p.x, p.y);
    i === 0 ? g.moveTo(cx, cy) : g.lineTo(cx, cy);
  });
  g.stroke();

  g.lineWidth = Math.max(2.5, u * 0.085);
  g.strokeStyle = stroke + '0.9)';
  g.setLineDash([u * 0.16, u * 0.13]);
  g.lineDashOffset = -time * 26;
  g.stroke();
  g.setLineDash([]);

  // where the routine begins
  const start = cellCenter(path[0].x, path[0].y);
  g.lineWidth = Math.max(2, u * 0.05);
  g.strokeStyle = stroke + '0.85)';
  g.beginPath();
  g.arc(start.cx, start.cy, u * 0.32, 0, Math.PI * 2);
  g.stroke();

  path.forEach((p, i) => {
    if (i === 0) return;
    const { cx, cy } = cellCenter(p.x, p.y);
    const isLast = i === path.length - 1;
    g.fillStyle = isLast ? stroke + '1)' : stroke + '0.55)';
    g.beginPath();
    g.arc(cx, cy, u * (isLast ? 0.14 : 0.075), 0, Math.PI * 2);
    g.fill();
  });

  // where it ends up, and which way it will be looking
  const end = path[path.length - 1];
  const { cx, cy } = cellCenter(end.x, end.y);
  g.translate(cx, cy);
  g.rotate((end.dir * Math.PI) / 2);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.moveTo(u * 0.46, 0);
  g.lineTo(u * 0.16, -u * 0.21);
  g.lineTo(u * 0.16, u * 0.21);
  g.closePath();
  g.fill();
  g.fillStyle = stroke + '1)';
  g.beginPath();
  g.moveTo(u * 0.42, 0);
  g.lineTo(u * 0.18, -u * 0.17);
  g.lineTo(u * 0.18, u * 0.17);
  g.closePath();
  g.fill();
  g.restore();
}

function drawParticle(g, p, time) {
  const age = time - p.at;
  const k = 1 - age / p.life;
  if (k <= 0) return;
  if (p.kind === 'ring') {
    const r = p.size * (1 + (1 - k) * 2.2);
    g.strokeStyle = `rgba(${p.rgb},${(k * 0.55).toFixed(3)})`;
    g.lineWidth = Math.max(1, r * 0.1);
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.stroke();
  } else if (p.kind === 'spark') {
    const x = p.x + p.vx * age;
    const y = p.y + p.vy * age + 400 * age * age;
    g.fillStyle = `rgba(${p.rgb},${(k * 0.85).toFixed(3)})`;
    g.beginPath();
    g.arc(x, y, Math.max(0.5, p.size * k), 0, Math.PI * 2);
    g.fill();
  } else if (p.kind === 'fly') {
    const t = 1 - k;
    const x = p.x + (p.x2 - p.x) * t;
    const y = p.y + (p.y2 - p.y) * t - Math.sin(t * Math.PI) * p.size * 3;
    g.fillStyle = C.berry;
    g.beginPath();
    g.arc(x, y, p.size, 0, Math.PI * 2);
    g.fill();
  }
}

export { DX, DY };
