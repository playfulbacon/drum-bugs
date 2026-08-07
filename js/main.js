import { VERSION, VERSION_NAME } from './version.js';
import { AudioEngine } from './audio.js';
import {
  createState, advance, placeBug, removeBug, bugInLane, stompBug,
  qualityFromOffset, setCols, BUGS, ROWS, STEPS_PER_BAR,
} from './game.js';
import { computeLayout, cellFromPoint, cellCenter, draw, layout } from './render.js';

const BPM = 108;
const STEP_DUR = 60 / BPM;
const GLIDE = Math.min(0.19, STEP_DUR * 0.55);

const QUALITY_RGB = {
  crack: '255,236,182',
  good: '198,222,178',
  thud: '146,146,126',
};

// Stands in for the audio engine on the title screen, so the field can crawl
// around quietly behind the card before the browser lets us make noise.
const SILENT = new Proxy({ pulseOn: false, now: 0 }, {
  get: (t, k) => (k in t ? t[k] : () => {}),
});

const app = {
  canvas: null,
  g: null,
  view: { w: 0, h: 0 },
  state: null,
  audio: SILENT,
  live: false,
  nextStep: 0,
  selected: 'beetle',
};

// ---------------------------------------------------------------------------
// clocks

const visNow = () => performance.now() / 1000;
const beatNow = () => (app.live ? app.audio.now : visNow());

// ---------------------------------------------------------------------------
// effects

function push(p) {
  const s = app.state;
  s.particles.push(p);
  if (s.particles.length > 320) s.particles.splice(0, s.particles.length - 320);
}

const effects = {
  ripple(cell, strength, color) {
    const { cx, cy } = cellCenter(cell.x, cell.r);
    push({
      kind: 'ring', x: cx, y: cy, at: visNow(), life: 0.5,
      size: layout.u * 0.18 * (1 + strength),
      rgb: color ? hexToRgb(color) : '190,200,170',
    });
  },

  pickup(bug) {
    const { cx, cy } = cellCenter(bug.x, bug.r);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      push({
        kind: 'spark', x: cx, y: cy, at: visNow(), life: 0.5,
        vx: Math.cos(a) * 26, vy: Math.sin(a) * 26 - 40,
        size: layout.u * 0.05, rgb: '198,158,96',
      });
    }
  },

  stomp(bug, cell, quality, planted) {
    const now = visNow();
    const { cx, cy } = cellCenter(bug.x, bug.r);
    const rgb = QUALITY_RGB[quality];
    const power = quality === 'crack' ? 1 : quality === 'good' ? 0.72 : 0.42;

    push({ kind: 'ring', x: cx, y: cy, at: now, life: 0.55, size: layout.u * 0.3 * power, rgb });

    const n = Math.round(6 + 12 * power);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.7;
      const sp = (60 + Math.random() * 150) * power;
      push({
        kind: 'spark', x: cx, y: cy + layout.u * 0.2, at: now, life: 0.4 + Math.random() * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: layout.u * (0.03 + Math.random() * 0.04), rgb,
      });
    }

    if (planted) {
      const frgb = hexToRgb(planted.color);
      push({ kind: 'ring', x: cx, y: cy, at: now, life: 0.9, size: layout.u * 0.34, rgb: frgb });
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 110;
        push({
          kind: 'spark', x: cx, y: cy, at: now, life: 0.7 + Math.random() * 0.5,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70,
          size: layout.u * 0.045, rgb: frgb,
        });
      }
    }

    app.state.flashes.push({ r: bug.r, at: now, life: 0.45, rgb });
    if (app.state.flashes.length > 12) app.state.flashes.shift();
  },

  gust() {
    const now = visNow();
    const dir = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < 34; i++) {
      const y = layout.oy + Math.random() * layout.h;
      const x = dir > 0 ? layout.ox - 40 - Math.random() * 200 : layout.ox + layout.w + 40 + Math.random() * 200;
      push({
        kind: 'drift', x, y, at: now, life: 2.4 + Math.random(),
        vx: dir * (140 + Math.random() * 120), vy: -12 + Math.random() * 24,
        size: 2 + Math.random() * 4, rgb: '176,186,148',
      });
    }
    flashBanner('a gust — more seeds');
  },
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// ---------------------------------------------------------------------------
// input

function handleLane(r) {
  const bug = bugInLane(app.state, r);
  if (!bug) {
    const placed = placeBug(app.state, r, app.selected);
    if (placed) {
      app.audio.drop(beatNow());
      refreshTray();
    }
    return;
  }

  // Quantise to the nearest beat. Early taps wait for it; late taps fire now.
  const now = beatNow();
  const toNext = app.nextStep - now;
  const sincePrev = STEP_DUR - toNext;

  if (toNext <= sincePrev) {
    bug.pendingStomp = qualityFromOffset(toNext);
  } else {
    const q = qualityFromOffset(sincePrev);
    stompBug(app.state, app.audio, bug, Math.max(now, app.audio.now || now), visNow(), q, effects);
  }
  showQuality(toNext <= sincePrev ? qualityFromOffset(toNext) : qualityFromOffset(sincePrev));
}

function onPointer(e) {
  const rect = app.canvas.getBoundingClientRect();
  const hit = cellFromPoint(e.clientX - rect.left, e.clientY - rect.top);
  if (!hit) return;
  if (e.shiftKey || e.button === 2) {
    if (removeBug(app.state, hit.r)) refreshTray();
    return;
  }
  handleLane(hit.r);
}

function onMove(e) {
  const rect = app.canvas.getBoundingClientRect();
  const hit = cellFromPoint(e.clientX - rect.left, e.clientY - rect.top);
  app.state.hoverLane = hit ? hit.r : null;
}

// ---------------------------------------------------------------------------
// hud

let bannerTimer = null;

function flashBanner(text) {
  const el = document.getElementById('banner');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

function showQuality(q) {
  const el = document.getElementById('quality');
  el.textContent = q === 'crack' ? 'CRACK!' : q === 'good' ? 'good' : 'thud';
  el.className = `quality ${q} show`;
  setTimeout(() => el.classList.remove('show'), 420);
}

function refreshTray() {
  document.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('sel', c.dataset.bug === app.selected);
  });
  const n = app.state.bugs.length;
  document.getElementById('count').textContent = `${n}/${ROWS} lanes`;
}

function beatDots(step) {
  const i = step % STEPS_PER_BAR;
  document.querySelectorAll('#beat span').forEach((d, k) => {
    d.classList.toggle('on', k === i);
  });
}

// ---------------------------------------------------------------------------
// loop

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const el = app.canvas;
  const w = el.clientWidth;
  const h = el.clientHeight;
  el.width = Math.round(w * dpr);
  el.height = Math.round(h * dpr);
  app.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  app.view.w = w;
  app.view.h = h;
  computeLayout(w, h);
}

function stepTick() {
  const now = beatNow();
  if (now < app.nextStep) return;
  // If we've fallen badly behind (tab was hidden), resync rather than catch up.
  if (now - app.nextStep > STEP_DUR * 4) app.nextStep = now;
  const tAudio = app.live ? Math.max(app.nextStep, app.audio.now) : 0;
  advance(app.state, app.audio, tAudio, visNow(), effects);
  beatDots(app.state.step);
  app.nextStep += STEP_DUR;
}

function frame() {
  const t = visNow();
  const s = app.state;

  for (const bug of s.bugs) {
    const k = Math.min(1, Math.max(0, (t - bug.moveAt) / GLIDE));
    const e = 1 - Math.pow(1 - k, 3);
    bug.visX = bug.fromX + (bug.x - bug.fromX) * e;
  }

  s.particles = s.particles.filter((p) => t - p.at < p.life);
  s.flashes = s.flashes.filter((f) => t - f.at < f.life);

  draw(app.g, s, app.view, t);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// boot

function boot() {
  setCols(window.innerWidth < 700 ? 8 : 13);
  app.state = createState();

  app.canvas = document.getElementById('field');
  app.g = app.canvas.getContext('2d');

  document.getElementById('version').textContent = `v${VERSION}`;
  document.getElementById('versionName').textContent = VERSION_NAME;
  document.getElementById('hudVersion').textContent = `v${VERSION}`;

  // bug chips
  const tray = document.getElementById('tray');
  for (const [key, spec] of Object.entries(BUGS)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.bug = key;
    b.innerHTML = `<b>${spec.label}</b><i>${spec.hint}</i>`;
    b.addEventListener('click', () => { app.selected = key; refreshTray(); });
    tray.appendChild(b);
  }
  refreshTray();

  app.canvas.addEventListener('pointerdown', onPointer);
  app.canvas.addEventListener('pointermove', onMove);
  app.canvas.addEventListener('pointerleave', () => { app.state.hoverLane = null; });
  app.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); onPointer(e); });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= ROWS) { handleLane(n - 1); e.preventDefault(); }
  });

  document.getElementById('clear').addEventListener('click', () => {
    app.state = createState();
    refreshTray();
    flashBanner('fresh patch of ground');
  });

  document.getElementById('pulse').addEventListener('click', (e) => {
    app.audio.pulseOn = !app.audio.pulseOn;
    e.currentTarget.classList.toggle('off', !app.audio.pulseOn);
  });

  window.addEventListener('resize', resize);
  resize();

  // Title screen: a couple of bugs already wandering, silently.
  placeBug(app.state, 1, 'beetle');
  placeBug(app.state, 3, 'snail');
  app.nextStep = visNow() + 0.3;

  setInterval(stepTick, 5);
  requestAnimationFrame(frame);

  document.getElementById('start').addEventListener('click', async () => {
    const engine = new AudioEngine();
    await engine.start();
    engine.pulseOn = !document.getElementById('pulse').classList.contains('off');
    app.audio = engine;
    app.live = true;
    app.nextStep = engine.now + 0.25;
    document.getElementById('title').classList.add('gone');
    flashBanner('tap a lane to stomp');
  });
}

boot();
