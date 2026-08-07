// Everything you see. Muted, damp, rounded — a patch of forest floor.

import { COLS, ROWS } from './game.js';

// cw/ch are the lane cell footprint; u is the unit everything is *drawn* at,
// so objects stay square even when lanes are taller than they are wide.
export const layout = { cw: 0, ch: 0, u: 0, ox: 0, oy: 0, w: 0, h: 0 };

const PALETTE = {
  leaf: '#8a7431',
  leafDark: '#6b5824',
  puddle: '#2d5464',
  log: '#4d3826',
  logDark: '#3a2a1c',
  stone: '#5c615b',
  moss: '#456331',
  mossLight: '#5b8040',
  soil: '#4a3a28',
  soilDark: '#382c1e',
  seed: '#a37a49',
  seedDark: '#6d4f2c',
};

const BUG_COLORS = {
  snail:   { body: '#d8c19a', shell: '#c08a4e', shellDark: '#8d6134' },
  beetle:  { body: '#2f3a4a', shell: '#1e2733', shellDark: '#141b24' },
  cricket: { body: '#7fa653', shell: '#96bf63', shellDark: '#5d7d3a' },
};

// Stable pseudo-random per index, so the field doesn't shimmer between frames.
function hash(i) {
  let h = Math.imul(i | 0, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

let ground = null;

export function computeLayout(w, h) {
  const padX = Math.min(44, w * 0.045);
  const padY = 14;
  let cw = (w - padX * 2) / COLS;
  let ch = (h - padY * 2) / ROWS;
  ch = Math.min(ch, cw * 2.4);
  cw = Math.min(cw, ch * 1.7);

  layout.cw = cw;
  layout.ch = ch;
  layout.u = Math.min(cw, ch);
  layout.w = cw * COLS;
  layout.h = ch * ROWS;
  layout.ox = (w - layout.w) / 2;
  layout.oy = (h - layout.h) / 2;

  ground = buildGround(w, h);
}

// A mottled dirt backdrop, baked once so it costs nothing per frame.
function buildGround(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');

  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#101a0e');
  bg.addColorStop(0.55, '#0c130a');
  bg.addColorStop(1, '#080d07');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < 220; i++) {
    const x = hash(i * 3 + 1) * w;
    const y = hash(i * 5 + 2) * h;
    const r = 20 + hash(i * 7 + 3) * 110;
    const light = hash(i * 11 + 4) > 0.55;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? 'rgba(96,120,70,0.045)' : 'rgba(0,0,0,0.09)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // scattered grit
  for (let i = 0; i < 500; i++) {
    const x = hash(i * 13 + 5) * w;
    const y = hash(i * 17 + 6) * h;
    g.fillStyle = hash(i * 19 + 7) > 0.5 ? 'rgba(180,190,150,0.035)' : 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.arc(x, y, 0.6 + hash(i * 23 + 8) * 1.6, 0, Math.PI * 2);
    g.fill();
  }

  return c;
}

export function cellFromPoint(px, py) {
  const x = Math.floor((px - layout.ox) / layout.cw);
  const r = Math.floor((py - layout.oy) / layout.ch);
  if (x < 0 || x >= COLS || r < 0 || r >= ROWS) return null;
  return { x, r };
}

export function cellCenter(x, r) {
  return {
    cx: layout.ox + (x + 0.5) * layout.cw,
    cy: layout.oy + (r + 0.5) * layout.ch,
  };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shadow(g, u, wide, tall) {
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(0, u * 0.2, u * wide, u * tall, 0, 0, Math.PI * 2);
  g.fill();
}

export function draw(g, state, view, time) {
  const { w, h } = view;
  const { cw, ch, u } = layout;

  if (ground) g.drawImage(ground, 0, 0, w, h);
  else { g.fillStyle = '#0c130a'; g.fillRect(0, 0, w, h); }

  // lane bands — enough to read as tap targets, not enough to look like a grid
  for (let r = 0; r < ROWS; r++) {
    const y = layout.oy + r * ch;
    g.fillStyle = r % 2 === 0 ? 'rgba(255,255,255,0.016)' : 'rgba(0,0,0,0.07)';
    g.fillRect(layout.ox, y, layout.w, ch);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(layout.ox, y + ch - 1, layout.w, 1);
  }

  if (state.hoverLane != null) {
    const y = layout.oy + state.hoverLane * ch;
    g.fillStyle = 'rgba(190,220,160,0.035)';
    g.fillRect(layout.ox, y, layout.w, ch);
    g.strokeStyle = 'rgba(190,220,160,0.12)';
    g.lineWidth = 1;
    g.strokeRect(layout.ox + 0.5, y + 0.5, layout.w - 1, ch - 1);
  }

  for (const cell of state.cells) drawCell(g, cell, u, time);

  for (const f of state.flashes) {
    const k = 1 - (time - f.at) / f.life;
    if (k <= 0) continue;
    g.fillStyle = `rgba(${f.rgb},${(k * k * 0.15).toFixed(3)})`;
    g.fillRect(layout.ox, layout.oy + f.r * ch, layout.w, ch);
  }

  for (const p of state.particles) drawParticle(g, p, time);
  for (const bug of state.bugs) drawBug(g, bug, u, time);
}

function drawCell(g, cell, u, time) {
  const { cx, cy } = cellCenter(cell.x, cell.r);
  const n1 = hash(cell.r * COLS + cell.x);
  const n2 = hash(cell.r * COLS + cell.x + 7777);
  const s = u * 0.5;

  g.save();
  g.translate(cx + (n1 - 0.5) * u * 0.1, cy + (n2 - 0.5) * u * 0.1);

  switch (cell.terrain) {
    case 'leaf': {
      g.rotate((n1 - 0.5) * 1.7);
      shadow(g, u, 0.36, 0.11);
      g.fillStyle = PALETTE.leaf;
      g.beginPath();
      g.moveTo(-s * 0.82, 0);
      g.quadraticCurveTo(-s * 0.2, -s * 0.52, s * 0.8, -s * 0.06);
      g.quadraticCurveTo(-s * 0.2, s * 0.5, -s * 0.82, 0);
      g.fill();
      g.strokeStyle = PALETTE.leafDark;
      g.lineWidth = Math.max(1, u * 0.028);
      g.beginPath();
      g.moveTo(-s * 0.76, 0);
      g.quadraticCurveTo(0, -s * 0.06, s * 0.74, -s * 0.05);
      g.stroke();
      g.globalAlpha = 0.5;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * s * 0.26, -s * 0.03);
        g.lineTo(i * s * 0.26 + s * 0.13, -s * 0.26);
        g.moveTo(i * s * 0.26, -s * 0.02);
        g.lineTo(i * s * 0.26 + s * 0.13, s * 0.22);
        g.stroke();
      }
      break;
    }
    case 'puddle': {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.ellipse(0, u * 0.03, s * 0.9, s * 0.5, (n1 - 0.5) * 0.7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PALETTE.puddle;
      g.beginPath();
      g.ellipse(0, 0, s * 0.86, s * 0.45, (n1 - 0.5) * 0.7, 0, Math.PI * 2);
      g.fill();
      const shimmer = 0.5 + 0.5 * Math.sin(time * 1.3 + n1 * 9);
      g.strokeStyle = `rgba(150,205,222,${(0.12 + shimmer * 0.18).toFixed(3)})`;
      g.lineWidth = Math.max(1, u * 0.03);
      g.beginPath();
      g.ellipse(-s * 0.14, -s * 0.1, s * 0.4, s * 0.14, 0.25, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'log': {
      shadow(g, u, 0.5, 0.14);
      g.fillStyle = PALETTE.log;
      roundRect(g, -s * 0.92, -s * 0.44, s * 1.84, s * 0.9, u * 0.12);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.055)';
      roundRect(g, -s * 0.86, -s * 0.4, s * 1.7, s * 0.24, u * 0.08);
      g.fill();
      g.fillStyle = PALETTE.logDark;
      g.beginPath();
      g.ellipse(-s * 0.76, s * 0.01, s * 0.19, s * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.lineWidth = Math.max(1, u * 0.022);
      g.beginPath();
      g.moveTo(-s * 0.4, -s * 0.14);
      g.lineTo(s * 0.86, -s * 0.14);
      g.moveTo(-s * 0.28, s * 0.16);
      g.lineTo(s * 0.86, s * 0.16);
      g.stroke();
      break;
    }
    case 'stone': {
      shadow(g, u, 0.36, 0.1);
      g.fillStyle = PALETTE.stone;
      g.beginPath();
      g.moveTo(-s * 0.58, s * 0.3);
      g.lineTo(-s * 0.42, -s * 0.3);
      g.lineTo(s * 0.32, -s * 0.44);
      g.lineTo(s * 0.6, s * 0.1);
      g.lineTo(s * 0.2, s * 0.38);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.09)';
      g.beginPath();
      g.moveTo(-s * 0.42, -s * 0.3);
      g.lineTo(s * 0.32, -s * 0.44);
      g.lineTo(s * 0.08, -s * 0.1);
      g.closePath();
      g.fill();
      break;
    }
    case 'moss': {
      g.fillStyle = PALETTE.moss;
      g.beginPath();
      g.ellipse(0, 0, s * 0.82, s * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PALETTE.mossLight;
      for (let i = 0; i < 8; i++) {
        const a = hash(cell.x * 31 + cell.r * 7 + i * 3) * Math.PI * 2;
        const d = hash(cell.x * 17 + cell.r * 11 + i) * s * 0.6;
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d * 0.55, u * 0.04, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'soil': {
      g.fillStyle = PALETTE.soil;
      g.beginPath();
      g.ellipse(0, 0, s * 0.84, s * 0.48, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PALETTE.soilDark;
      for (let i = 0; i < 6; i++) {
        const a = hash(cell.x * 13 + cell.r * 23 + i * 5) * Math.PI * 2;
        const d = hash(cell.x * 29 + cell.r * 3 + i) * s * 0.55;
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d * 0.5, u * 0.032, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    default: {
      g.fillStyle = 'rgba(0,0,0,0.14)';
      g.beginPath();
      g.ellipse(0, 0, s * 0.3, s * 0.18, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();

  if (cell.seed) drawSeed(g, cx, cy, u, time, n1);
  if (cell.flower) drawFlower(g, cell, cx, cy, u, time);
}

function drawSeed(g, cx, cy, u, time, n) {
  const bob = Math.sin(time * 2 + n * 8) * u * 0.022;
  g.save();
  g.translate(cx, cy + bob);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(0, u * 0.12, u * 0.13, u * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  g.rotate(0.4 + n);
  g.fillStyle = PALETTE.seedDark;
  g.beginPath();
  g.ellipse(0, 0, u * 0.155, u * 0.105, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PALETTE.seed;
  g.beginPath();
  g.ellipse(-u * 0.01, -u * 0.016, u * 0.125, u * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,240,210,0.45)';
  g.beginPath();
  g.ellipse(-u * 0.042, -u * 0.036, u * 0.032, u * 0.021, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawFlower(g, cell, cx, cy, u, time) {
  const f = cell.flower;
  const s = u * 0.5 * f.size;
  const sway = Math.sin(time * 1.1 + f.sway) * 0.13;
  g.save();
  g.translate(cx, cy + u * 0.14);
  g.rotate(sway);

  g.strokeStyle = '#5f7f3c';
  g.lineWidth = Math.max(1.2, u * 0.035);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(s * 0.12, -s * 0.44, 0, -s * 0.8);
  g.stroke();

  g.translate(0, -s * 0.84);

  if (f.kind === 'crystal') {
    g.fillStyle = f.color;
    for (let i = 0; i < 3; i++) {
      g.save();
      g.rotate((i / 3) * Math.PI * 2);
      g.beginPath();
      g.moveTo(0, -s * 0.44);
      g.lineTo(s * 0.13, 0);
      g.lineTo(0, s * 0.16);
      g.lineTo(-s * 0.13, 0);
      g.closePath();
      g.fill();
      g.restore();
    }
  } else if (f.kind === 'dew') {
    g.fillStyle = f.color;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + time * 0.3;
      g.beginPath();
      g.arc(Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22, s * 0.2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(0, 0, s * 0.12, 0, Math.PI * 2);
    g.fill();
  } else if (f.kind === 'pod') {
    g.fillStyle = f.color;
    g.beginPath();
    g.ellipse(0, 0, s * 0.24, s * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = Math.max(1, u * 0.02);
    g.beginPath();
    g.moveTo(0, -s * 0.34);
    g.lineTo(0, s * 0.34);
    g.stroke();
  } else {
    g.fillStyle = f.color;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.beginPath();
      g.ellipse(Math.cos(a) * s * 0.27, Math.sin(a) * s * 0.27, s * 0.21, s * 0.16, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f4dd93';
    g.beginPath();
    g.arc(0, 0, s * 0.15, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function drawBug(g, bug, u, time) {
  const { cx, cy } = cellCenter(bug.visX, bug.r);
  const col = BUG_COLORS[bug.type];
  const s = u * 0.34;

  const since = time - bug.stompAt;
  let sx = 1;
  let sy = 1;
  if (since >= 0 && since < 0.26) {
    const k = 1 - since / 0.26;
    sx = 1 + 0.34 * k * k;
    sy = 1 - 0.3 * k * k;
  }

  const wiggle = Math.sin(time * 9 + bug.r) * 0.06;

  g.save();
  g.translate(cx, cy);

  g.fillStyle = 'rgba(0,0,0,0.34)';
  g.beginPath();
  g.ellipse(0, s * 0.62, s * 0.82 * sx, s * 0.24, 0, 0, Math.PI * 2);
  g.fill();

  g.scale(bug.dir >= 0 ? 1 : -1, 1);
  g.scale(sx, sy);
  g.rotate(wiggle * 0.3);

  g.strokeStyle = col.shellDark;
  g.lineWidth = Math.max(1.2, u * 0.032);
  for (let i = -1; i <= 1; i++) {
    const p = Math.sin(time * 9 + i * 1.7 + bug.r) * s * 0.22;
    g.beginPath();
    g.moveTo(i * s * 0.4, s * 0.1);
    g.lineTo(i * s * 0.4 + p, s * 0.64);
    g.stroke();
  }

  if (bug.type === 'snail') {
    g.fillStyle = col.body;
    g.beginPath();
    g.ellipse(s * 0.25, s * 0.22, s * 0.88, s * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col.shell;
    g.beginPath();
    g.arc(-s * 0.15, -s * 0.14, s * 0.64, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = col.shellDark;
    g.lineWidth = Math.max(1.2, u * 0.03);
    g.beginPath();
    for (let a = 0; a < Math.PI * 3.4; a += 0.2) {
      const rr = s * 0.08 + (a / (Math.PI * 3.4)) * s * 0.54;
      const px = -s * 0.15 + Math.cos(a) * rr;
      const py = -s * 0.14 + Math.sin(a) * rr;
      a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.stroke();
    g.strokeStyle = col.body;
    g.lineWidth = Math.max(1.2, u * 0.028);
    g.beginPath();
    g.moveTo(s * 0.92, s * 0.06);
    g.lineTo(s * 1.18, -s * 0.4);
    g.moveTo(s * 0.8, s * 0.02);
    g.lineTo(s * 0.98, -s * 0.48);
    g.stroke();
  } else {
    g.fillStyle = col.shell;
    g.beginPath();
    g.ellipse(0, 0, s * 0.98, s * 0.64, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.09)';
    g.beginPath();
    g.ellipse(-s * 0.1, -s * 0.26, s * 0.62, s * 0.18, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col.shellDark;
    g.beginPath();
    g.ellipse(-s * 0.05, 0, s * 0.055, s * 0.62, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col.body;
    g.beginPath();
    g.arc(s * 0.84, -s * 0.06, s * 0.38, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = col.shellDark;
    g.lineWidth = Math.max(1.2, u * 0.026);
    g.beginPath();
    g.moveTo(s * 1.0, -s * 0.3);
    g.lineTo(s * 1.36, -s * 0.68);
    g.moveTo(s * 0.9, -s * 0.34);
    g.lineTo(s * 1.06, -s * 0.78);
    g.stroke();
    if (bug.type === 'cricket') {
      g.strokeStyle = col.shellDark;
      g.lineWidth = Math.max(1.6, u * 0.042);
      g.beginPath();
      g.moveTo(-s * 0.5, s * 0.05);
      g.lineTo(-s * 0.98, -s * 0.42);
      g.lineTo(-s * 0.72, s * 0.56);
      g.stroke();
    }
  }

  g.fillStyle = '#12140f';
  g.beginPath();
  g.arc(s * 0.95, -s * 0.08, s * 0.1, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.arc(s * 0.98, -s * 0.11, s * 0.035, 0, Math.PI * 2);
  g.fill();

  g.restore();

  // carried seed rides on the back
  if (bug.carrying) {
    const bob = Math.sin(time * 3) * u * 0.016;
    g.save();
    g.translate(cx - bug.dir * s * 0.15, cy - s * 0.8 + bob);
    g.fillStyle = PALETTE.seedDark;
    g.beginPath();
    g.ellipse(0, 0, u * 0.145, u * 0.1, 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.seed;
    g.beginPath();
    g.ellipse(-u * 0.012, -u * 0.017, u * 0.115, u * 0.076, 0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

function drawParticle(g, p, time) {
  const age = time - p.at;
  const k = 1 - age / p.life;
  if (k <= 0) return;

  if (p.kind === 'ring') {
    const rr = p.size * (1 + (1 - k) * 2.4);
    g.strokeStyle = `rgba(${p.rgb},${(k * 0.5).toFixed(3)})`;
    g.lineWidth = Math.max(1, rr * 0.08);
    g.beginPath();
    g.ellipse(p.x, p.y, rr, rr * 0.45, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (p.kind === 'spark') {
    const x = p.x + p.vx * age;
    const y = p.y + p.vy * age + 420 * age * age;
    g.fillStyle = `rgba(${p.rgb},${(k * 0.8).toFixed(3)})`;
    g.beginPath();
    g.arc(x, y, Math.max(0.5, p.size * k), 0, Math.PI * 2);
    g.fill();
  } else if (p.kind === 'drift') {
    const x = p.x + p.vx * age;
    const y = p.y + p.vy * age + Math.sin(age * 3 + p.size) * 8;
    g.fillStyle = `rgba(${p.rgb},${(k * 0.45).toFixed(3)})`;
    g.beginPath();
    g.ellipse(x, y, p.size, p.size * 0.5, age * 2, 0, Math.PI * 2);
    g.fill();
  }
}
