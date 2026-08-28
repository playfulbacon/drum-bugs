import { VERSION, VERSION_NAME } from './version.js';
import { AudioEngine } from './audio.js';
import {
  createState, advance, previewPath, placeBug, removeBug, bugAt, cellAt,
  walkable, nextBarTick, alignTo, BUGS, TYPES, MAX_SLOTS, TICKS_PER_BAR,
} from './game.js';
import { computeLayout, cellFromPoint, cellCenter, draw, layout } from './render.js';

// Time is in ticks — eighth notes. Cricket acts every tick, ant every 2,
// beetle every 4.
const IMMEDIATE_WINDOW = 0.07;
const GLIDE = 0.13;

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
  mode: 'play',
  bpm: 96,
  tickDur: 0.3125,
  nextTick: 0,
  selected: 'ant',
  teach: null,
  queued: [],
};

const visNow = () => performance.now() / 1000;
const beatNow = () => (app.live ? app.audio.now : visNow());
const setBpm = (bpm) => { app.bpm = bpm; app.tickDur = 60 / bpm / 2; };

// ---------------------------------------------------------------------------
// effects

function push(p) {
  const list = app.state.particles;
  list.push(p);
  if (list.length > 300) list.splice(0, list.length - 300);
}

function burst(cx, cy, n, rgb, speed, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.4 + Math.random() * 0.9);
    push({
      kind: 'spark', x: cx, y: cy, at: visNow(), life: life * (0.6 + Math.random() * 0.6),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.4,
      size: layout.u * 0.045, rgb,
    });
  }
}

function ring(cx, cy, size, rgb, life = 0.5) {
  push({ kind: 'ring', x: cx, y: cy, at: visNow(), life, size, rgb });
}

const fx = {
  step(bug, accented) {
    if (!accented) return;
    const { cx, cy } = cellCenter(bug.x, bug.y);
    ring(cx, cy, layout.u * 0.2, '255,236,182');
  },
  bump(bug) {
    const { cx, cy } = cellCenter(bug.x, bug.y);
    burst(cx, cy, 3, '150,150,130', 40, 0.3);
  },
  pickup(bug) {
    const { cx, cy } = cellCenter(bug.x, bug.y);
    burst(cx, cy, 8, '232,121,140', 70, 0.5);
  },
  deliver(bug) {
    const { cx, cy } = cellCenter(bug.x, bug.y);
    ring(cx, cy, layout.u * 0.35, '224,201,138', 0.8);
    burst(cx, cy, 16, '224,201,138', 130, 0.7);
    bumpScore();
  },
  smash(cell) {
    const { cx, cy } = cellCenter(cell.x, cell.y);
    ring(cx, cy, layout.u * 0.3, '190,196,186', 0.6);
    burst(cx, cy, 14, '150,158,148', 150, 0.6);
  },
  jump(bug) {
    const { cx, cy } = cellCenter(bug.x, bug.y);
    ring(cx, cy, layout.u * 0.24, '160,220,235', 0.5);
  },
  kick(from, to) {
    const a = cellCenter(from.x, from.y);
    const b = cellCenter(to.x, to.y);
    push({
      kind: 'fly', x: a.cx, y: a.cy, x2: b.cx, y2: b.cy,
      at: visNow(), life: 0.32, size: layout.u * 0.16,
    });
    burst(a.cx, a.cy, 5, '232,121,140', 80, 0.35);
  },
  whiff(bug) {
    const { cx, cy } = cellCenter(bug.x, bug.y);
    ring(cx, cy, layout.u * 0.1, '120,130,110', 0.3);
  },
  win() {
    flashBanner('every berry home — the garden is quiet again');
  },
};

// ---------------------------------------------------------------------------
// teaching

function startTeach(bug) {
  app.mode = 'teach';
  app.teach = {
    bug,
    slots: [],
    previousLoop: bug.loop,
    pending: null,
    pendingNext: null,
    countIn: 2,
    recording: false,
    ticksToSlot: bug.period,
    preview: previewPath(app.state, bug, []),
  };
  document.getElementById('playPanel').hidden = true;
  document.getElementById('teachPanel').hidden = false;
  refreshTeachUI();
}

function teachTick(tAudio) {
  const t = app.teach;
  t.ticksToSlot--;
  if (t.ticksToSlot > 0) return;
  t.ticksToSlot = t.bug.period;

  if (t.countIn > 0) {
    t.countIn--;
    app.audio.countIn(tAudio, t.countIn === 0);
    if (t.countIn === 0) t.recording = true;
    refreshTeachUI();
    return;
  }

  t.slots.push(t.pending || 'rest');
  t.pending = t.pendingNext;
  t.pendingNext = null;
  t.preview = previewPath(app.state, t.bug, t.slots);
  refreshTeachUI();

  if (t.slots.length >= MAX_SLOTS) finishTeach();
}

// A press lands in the slot it is nearest to, so being slightly early still
// records where you meant it.
function pressVerb(v) {
  const t = app.teach;
  if (!t) return;
  litVerb(v);
  previewVerbSound(v);
  if (!t.recording) return;
  const slotDur = t.bug.period * app.tickDur;
  const boundary = app.nextTick + (t.ticksToSlot - 1) * app.tickDur;
  if (boundary - beatNow() < slotDur * 0.45) t.pendingNext = v;
  else t.pending = v;
  refreshTeachUI();
}

function previewVerbSound(v) {
  const a = app.audio;
  const t = beatNow();
  if (v === 'step') a.foot(app.teach.bug.type, t, 0.8);
  else if (v === 'act') a.pluck(t, 0.6);
  else a.scrape(t, 0.8);
}

function finishTeach() {
  const t = app.teach;
  const loop = t.slots.length ? t.slots : ['rest'];
  t.bug.loop = loop;
  t.bug.slot = 0;
  alignTo(t.bug, app.state.tick, nextBarTick(app.state.tick));
  endTeach();
  flashBanner(t.preview.closes ? 'routine set — it closes' : 'routine set — it drifts');
}

function cancelTeach() {
  app.teach.bug.loop = app.teach.previousLoop;
  endTeach();
}

function endTeach() {
  app.mode = 'play';
  app.teach = null;
  document.getElementById('playPanel').hidden = false;
  document.getElementById('teachPanel').hidden = true;
  renderPattern(null);
}

// ---------------------------------------------------------------------------
// conducting

function timeToNearestTick() {
  const toNext = app.nextTick - beatNow();
  const sincePrev = app.tickDur - toNext;
  return toNext <= sincePrev ? toNext : -sincePrev;
}

// Loose input lands on the next bar line; dead on the beat it lands now.
function conduct(fn, label) {
  if (Math.abs(timeToNearestTick()) < IMMEDIATE_WINDOW) {
    fn();
    flashBanner(`${label} — now`);
  } else {
    app.queued.push({ tick: nextBarTick(app.state.tick), fn });
    flashBanner(`${label} — next bar`);
  }
}

function toggleSection(type) {
  const sec = app.state.sections[type];
  conduct(() => {
    sec.active = !sec.active;
    if (sec.active) {
      const target = nextBarTick(app.state.tick);
      for (const b of app.state.bugs) {
        if (b.type === type) { b.slot = 0; alignTo(b, app.state.tick, target); }
      }
    }
    refreshMixer();
  }, sec.active ? `cut ${type}s` : `cue ${type}s`);
}

function nudgeSection(type) {
  for (const b of app.state.bugs) if (b.type === type) b.ticksToNext++;
  flashBanner(`${type}s — a beat late`);
  pingLane(type);
}

function accentSection(type) {
  for (const b of app.state.bugs) if (b.type === type) b.accentPending = true;
  pingLane(type);
}

// ---------------------------------------------------------------------------
// input

function onPointerDown(e) {
  const rect = app.canvas.getBoundingClientRect();
  const hit = cellFromPoint(e.clientX - rect.left, e.clientY - rect.top);
  if (!hit) return;
  if (app.mode === 'teach') return;

  const bug = bugAt(app.state, hit.x, hit.y);
  if (bug) {
    if (e.shiftKey || e.button === 2) {
      removeBug(app.state, bug);
      refreshTray();
      refreshMixer();
      app.audio.whiff(beatNow());
    } else {
      startTeach(bug);
    }
    return;
  }

  const cell = cellAt(app.state, hit.x, hit.y);
  if (!walkable(cell)) return;
  const placed = placeBug(app.state, hit.x, hit.y, app.selected);
  if (!placed) { flashBanner(`no ${app.selected}s left`); return; }
  app.audio.place(beatNow());
  refreshTray();
  refreshMixer();
  startTeach(placed);
}

function onPointerMove(e) {
  const rect = app.canvas.getBoundingClientRect();
  app.state.hover = cellFromPoint(e.clientX - rect.left, e.clientY - rect.top);
}

const VERB_KEYS = {
  w: 'step', arrowup: 'step',
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
  ' ': 'act',
};

function onKeyDown(e) {
  const k = e.key.toLowerCase();

  if (app.mode === 'teach') {
    if (k === 'enter') { finishTeach(); e.preventDefault(); return; }
    if (k === 'escape') { cancelTeach(); e.preventDefault(); return; }
    const v = VERB_KEYS[k];
    if (v && !e.repeat) { pressVerb(v); e.preventDefault(); }
    return;
  }

  const cue = { 1: 0, 2: 1, 3: 2 }[k];
  if (cue != null) { toggleSection(TYPES[cue]); return; }
  const nudge = { q: 0, w: 1, e: 2 }[k];
  if (nudge != null && !e.repeat) { nudgeSection(TYPES[nudge]); return; }
  const acc = { a: 0, s: 1, d: 2 }[k];
  if (acc != null && !e.repeat) { accentSection(TYPES[acc]); e.preventDefault(); }
}

// ---------------------------------------------------------------------------
// hud

let bannerTimer = null;

function flashBanner(text) {
  const el = document.getElementById('banner');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

function bumpScore() {
  const s = app.state;
  document.getElementById('score').textContent = `${s.delivered} / ${s.totalBerries} berries`;
}

function refreshTray() {
  document.querySelectorAll('.chip').forEach((c) => {
    const t = c.dataset.bug;
    c.classList.toggle('sel', t === app.selected);
    c.disabled = app.state.supply[t] <= 0;
    c.querySelector('.n').textContent = app.state.supply[t];
  });
}

function refreshMixer() {
  for (const t of TYPES) {
    const lane = document.querySelector(`.lane[data-bug="${t}"]`);
    if (!lane) continue;
    lane.classList.toggle('off', !app.state.sections[t].active);
    lane.querySelector('.count').textContent = app.state.bugs.filter((b) => b.type === t).length;
  }
}

function pingLane(type) {
  const dot = document.querySelector(`.lane[data-bug="${type}"] .dot`);
  if (!dot) return;
  dot.classList.add('hit');
  setTimeout(() => dot.classList.remove('hit'), 70);
}

function litVerb(v) {
  const b = document.querySelector(`.verb[data-verb="${v}"]`);
  if (!b) return;
  b.classList.add('lit');
  setTimeout(() => b.classList.remove('lit'), 90);
}

function refreshTeachUI() {
  const t = app.teach;
  if (!t) return;
  const spec = BUGS[t.bug.type];
  document.getElementById('teachWho').innerHTML =
    `${spec.label} <small>acts on ${spec.note} &middot; ${spec.blurb}</small>`;

  const st = document.getElementById('teachState');
  if (!t.recording) {
    st.textContent = `count in ${t.countIn}`;
    st.className = 'badge rec';
  } else {
    st.textContent = `${t.slots.length} / ${MAX_SLOTS}`;
    st.className = 'badge';
  }

  const cl = document.getElementById('teachCloses');
  if (!t.slots.length) {
    cl.textContent = 'empty';
    cl.className = 'badge';
  } else {
    cl.textContent = t.preview.closes ? 'CLOSES' : 'DRIFTS';
    cl.className = `badge ${t.preview.closes ? 'closes' : 'drifts'}`;
  }

  renderPattern(t.slots, t.pending);
}

const VERB_GLYPH = { step: '↑', left: '↺', right: '↻', act: '●', rest: '' };

function renderPattern(slots, pending) {
  const el = document.getElementById('pattern');
  if (!slots) { el.innerHTML = ''; return; }
  el.innerHTML = '';
  for (let i = 0; i < MAX_SLOTS; i++) {
    const span = document.createElement('span');
    const a = slots[i];
    if (a) { span.className = a; span.textContent = VERB_GLYPH[a]; }
    if (i === slots.length) {
      span.classList.add('now');
      if (pending) { span.className = `${pending} now`; span.textContent = VERB_GLYPH[pending]; }
    }
    el.appendChild(span);
  }
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
  if (now < app.nextTick) return;
  if (now - app.nextTick > app.tickDur * 4) app.nextTick = now;
  const tAudio = app.live ? Math.max(app.nextTick, app.audio.now) : 0;

  if (app.mode === 'teach') {
    teachTick(tAudio);
  } else {
    const due = app.state.tick + 1;
    app.queued = app.queued.filter((q) => {
      if (q.tick <= due) { q.fn(); return false; }
      return true;
    });
    advance(app.state, app.audio, tAudio, visNow(), fx);
    for (const b of app.state.bugs) {
      if (b.ticksToNext === b.period && app.state.sections[b.type].active) pingLane(b.type);
    }
  }
  app.nextTick += app.tickDur;
}

function frame() {
  const t = visNow();
  const s = app.state;

  for (const bug of s.bugs) {
    const k = Math.min(1, Math.max(0, (t - bug.moveAt) / GLIDE));
    const e = 1 - Math.pow(1 - k, 3);
    bug.visX = bug.fromX + (bug.x - bug.fromX) * e;
    bug.visY = bug.fromY + (bug.y - bug.fromY) * e;
    const target = (bug.dir * Math.PI) / 2;
    let d = target - bug.visDir;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    bug.visDir += d * 0.28;
  }

  s.particles = s.particles.filter((p) => t - p.at < p.life);
  draw(app.g, s, app.view, t, app.teach);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// boot

function buildTray() {
  const tray = document.getElementById('tray');
  tray.innerHTML = '';
  for (const t of TYPES) {
    const spec = BUGS[t];
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.bug = t;
    b.innerHTML = `<b>${spec.label} <span class="n"></span></b><i>${spec.note}</i>`;
    b.addEventListener('click', () => { app.selected = t; refreshTray(); });
    tray.appendChild(b);
  }
}

function buildMixer() {
  const mix = document.getElementById('mixer');
  mix.innerHTML = '';
  TYPES.forEach((t, i) => {
    const spec = BUGS[t];
    const el = document.createElement('div');
    el.className = 'lane';
    el.dataset.bug = t;
    el.innerHTML =
      `<span class="dot"></span>` +
      `<span class="nm"><b>${spec.label}s</b><span>&times;<i class="count">0</i></span></span>` +
      `<button data-do="cue">${i + 1}</button>` +
      `<button data-do="nudge">nudge</button>` +
      `<button data-do="accent">accent</button>`;
    el.querySelector('[data-do="cue"]').addEventListener('click', () => toggleSection(t));
    el.querySelector('[data-do="nudge"]').addEventListener('click', () => nudgeSection(t));
    el.querySelector('[data-do="accent"]').addEventListener('click', () => accentSection(t));
    mix.appendChild(el);
  });
}

function newGarden() {
  app.state = createState();
  app.queued = [];
  refreshTray();
  refreshMixer();
  bumpScore();
}

function boot() {
  app.canvas = document.getElementById('field');
  app.g = app.canvas.getContext('2d');
  window.DB = { app, layout }; // prototype poking hatch

  document.getElementById('version').textContent = `v${VERSION}`;
  document.getElementById('versionName').textContent = VERSION_NAME;
  document.getElementById('hudVersion').textContent = `v${VERSION}`;

  buildTray();
  buildMixer();
  newGarden();

  app.canvas.addEventListener('pointerdown', onPointerDown);
  app.canvas.addEventListener('pointermove', onPointerMove);
  app.canvas.addEventListener('pointerleave', () => { app.state.hover = null; });
  app.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); onPointerDown(e); });
  window.addEventListener('keydown', onKeyDown);

  document.querySelectorAll('.verb').forEach((b) => {
    // blur so a later space bar reaches the recorder, not the button
    b.addEventListener('click', () => { b.blur(); pressVerb(b.dataset.verb); });
  });
  document.getElementById('teachDone').addEventListener('click', finishTeach);
  document.getElementById('teachCancel').addEventListener('click', cancelTeach);

  document.getElementById('reset').addEventListener('click', () => {
    if (app.mode === 'teach') cancelTeach();
    newGarden();
    flashBanner('fresh garden');
  });

  document.getElementById('pulse').addEventListener('click', (e) => {
    app.audio.pulseOn = !app.audio.pulseOn;
    e.currentTarget.classList.toggle('off', !app.audio.pulseOn);
  });

  const tempo = document.getElementById('tempo');
  tempo.addEventListener('input', () => {
    setBpm(Number(tempo.value));
    document.getElementById('bpm').textContent = app.bpm;
  });
  setBpm(Number(tempo.value));

  window.addEventListener('resize', resize);
  resize();

  app.nextTick = visNow() + 0.3;
  setInterval(stepTick, 5);
  requestAnimationFrame(frame);

  document.getElementById('start').addEventListener('click', async () => {
    const engine = new AudioEngine();
    await engine.start();
    engine.pulseOn = !document.getElementById('pulse').classList.contains('off');
    app.audio = engine;
    app.live = true;
    app.nextTick = engine.now + 0.25;
    document.getElementById('title').classList.add('gone');
    flashBanner('pick a bug, click the garden');
  });
}

boot();
