import { VERSION, VERSION_NAME } from './version.js';
import { AudioEngine } from './audio.js';
import {
  createState, advance, previewPath, placeBug, removeBug, bugAt, cellAt,
  walkable, inSpawn, nextBarTick, slotsForBars, actsAt, slotStartsBar, pathHome,
  BUGS, TYPES, DIR_OF, BAR_CHOICES, TICKS_PER_BAR,
} from './game.js';
import { computeLayout, cellFromPoint, cellCenter, draw, layout } from './render.js';

const IMMEDIATE_WINDOW = 0.07;
const GLIDE = 0.13;

const QUALITY_RGB = { now: '255,236,182', bar: '198,222,178' };

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
const isMove = (a) => DIR_OF[a] != null;
const mod = (n, m) => ((n % m) + m) % m;

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
    ring(cx, cy, layout.u * 0.2, QUALITY_RGB.now);
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
  ripen(cell) {
    const { cx, cy } = cellCenter(cell.x, cell.y);
    ring(cx, cy, layout.u * 0.14, '232,121,140', 0.6);
  },
  doze(bug) {
    const { cx, cy } = cellCenter(bug.x, bug.y);
    burst(cx, cy, 4, '120,130,110', 24, 0.7);
  },
  wake(bug) {
    const { cx, cy } = cellCenter(bug.x, bug.y);
    ring(cx, cy, layout.u * 0.18, '198,222,178', 0.4);
  },
  win() {
    flashBanner('the nest is full — the garden is quiet again');
  },
};

// ---------------------------------------------------------------------------
// teaching — a looping recorder. The routine plays round and round while you
// build it, the bug walking it in ghost, and nothing commits until you confirm.

function startTeach(bug) {
  app.mode = 'teach';
  const t = {
    bug,
    bars: bug.bars,
    slots: bug.loop.slice(),
    prevLoop: bug.loop,
    prevBars: bug.bars,
    prevDir: bug.dir,
    head: -1,
    pending: null,
    // The ring starts the moment you pick the bug up, so slot 0 is the first
    // thing you drum — what you teach is what runs.
    startTick: app.state.tick,
    fromG: { x: bug.x, y: bug.y },
    toG: { x: bug.x, y: bug.y },
    gAt: -10,
    preview: null,
  };
  app.teach = t;
  recompute(t);
  document.getElementById('playPanel').hidden = true;
  document.getElementById('teachPanel').hidden = false;
  buildBars();
  refreshTeachUI();
}

function recompute(t) {
  t.preview = previewPath(app.state, t.bug, t.slots);
}

function teachTick(tAudio, tVis) {
  const t = app.teach;
  const period = t.bug.period;
  const since = app.state.tick - t.startTick;
  if (since < 0 || mod(since, period) !== 0) return;

  // Slot boundaries sit on world ticks, so the playhead moves in lockstep with
  // the pulse; the ring's origin is where you started.
  t.head = mod(Math.floor(since / period), t.slots.length);

  if (t.pending) {
    t.slots[t.head] = t.pending;
    t.pending = null;
    recompute(t);
  }

  // ghost walks the previewed path; at slot 0 it snaps back to the start,
  // which is what makes a travelling routine obvious
  const from = t.preview.path[t.head] || t.preview.path[0];
  const to = t.preview.path[t.head + 1] || t.preview.path[0];
  t.fromG = { x: from.x, y: from.y };
  t.toG = { x: to.x, y: to.y };
  t.gAt = tVis;
  t.bug.dir = to.dir;

  const a = t.slots[t.head];
  if (a === 'act') app.audio.pluck(tAudio, 0.5);
  else if (isMove(a)) app.audio.foot(t.bug.type, tAudio, 0.85);

  refreshTeachUI();
}

// A tap goes to whichever slot boundary it is nearest.
function pressVerb(v) {
  const t = app.teach;
  if (!t) return;
  litVerb(v);
  if (v === 'act') app.audio.pluck(beatNow(), 0.6);
  else app.audio.foot(t.bug.type, beatNow(), 0.8);

  const period = t.bug.period;
  const slotDur = period * app.tickDur;
  const ticksAhead = period - mod(app.state.tick - t.startTick, period);
  const toNext = app.nextTick + (ticksAhead - 1) * app.tickDur - beatNow();
  if (toNext <= slotDur / 2) {
    t.pending = v;
  } else if (t.head >= 0) {
    t.slots[t.head] = v;
    recompute(t);
  }
  refreshTeachUI();
}

function setBars(n) {
  const t = app.teach;
  const len = slotsForBars(n, t.bug.period);
  const old = t.slots;
  t.slots = new Array(len).fill('rest');
  for (let i = 0; i < Math.min(len, old.length); i++) t.slots[i] = old[i];
  t.bars = n;
  t.pending = null;
  recompute(t);
  buildBars();
  refreshTeachUI();
}

// Fill the trailing rests with the shortest walk back to the start.
function autoClose() {
  const t = app.teach;
  let last = -1;
  t.slots.forEach((a, i) => { if (a !== 'rest') last = i; });
  if (last < 0) { flashBanner('nothing to close yet'); return; }

  const home = pathHome(app.state, t.bug, t.slots);
  if (home === null) { flashBanner("can't walk home from there"); return; }
  if (!home.length) { flashBanner('already closes'); return; }

  const room = t.slots.length - 1 - last;
  if (home.length > room) {
    flashBanner(`needs ${home.length} free slots at the end — try a longer loop`);
    return;
  }
  for (let i = 0; i < home.length; i++) t.slots[last + 1 + i] = home[i];
  recompute(t);
  refreshTeachUI();
  flashBanner('closed the loop');
}

function clearRoutine() {
  const t = app.teach;
  t.slots = new Array(t.slots.length).fill('rest');
  t.pending = null;
  recompute(t);
  refreshTeachUI();
}

function finishTeach() {
  const t = app.teach;
  const bug = t.bug;
  bug.loop = t.slots.slice();
  bug.bars = t.bars;
  bug.dir = t.preview.startDir;
  // Start at slot 0 on the next bar line, so the routine that runs is exactly
  // the one the preview drew.
  bug.slot = 0;
  bug.phase = nextBarTick(app.state.tick);
  bug.idle = 0;
  bug.dozing = false;
  const closes = t.preview.closes;
  endTeach();
  flashBanner(closes ? 'routine set — it closes' : 'routine set — it travels');
}

function cancelTeach() {
  const t = app.teach;
  t.bug.loop = t.prevLoop;
  t.bug.bars = t.prevBars;
  t.bug.dir = t.prevDir;
  endTeach();
}

function endTeach() {
  const bug = app.teach.bug;
  bug.fromX = bug.x; bug.fromY = bug.y;
  bug.visX = bug.x; bug.visY = bug.y;
  bug.moveAt = -10;
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
    refreshMixer();
  }, sec.active ? `cut ${type}s` : `cue ${type}s`);
}

function nudgeSection(type) {
  for (const b of app.state.bugs) if (b.type === type) b.phase++;
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
  if (!hit || app.mode === 'teach') return;

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
  if (!inSpawn(app.state, hit.x, hit.y)) {
    flashBanner('bugs come out of the nest — drop it in the clearing');
    return;
  }
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
  w: 'north', arrowup: 'north',
  a: 'west', arrowleft: 'west',
  s: 'south', arrowdown: 'south',
  d: 'east', arrowright: 'east',
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
  document.getElementById('score').textContent = `${s.delivered} / ${s.quota} berries`;
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

function buildBars() {
  const el = document.getElementById('bars');
  el.innerHTML = '';
  for (const n of BAR_CHOICES) {
    const b = document.createElement('button');
    b.className = 'tool' + (app.teach && app.teach.bars === n ? ' primary' : '');
    b.textContent = `${n} bar${n > 1 ? 's' : ''}`;
    b.addEventListener('click', () => { b.blur(); setBars(n); });
    el.appendChild(b);
  }
}

function refreshTeachUI() {
  const t = app.teach;
  if (!t) return;
  const spec = BUGS[t.bug.type];
  document.getElementById('teachWho').innerHTML =
    `${spec.label} <small>${spec.note} &middot; ${spec.blurb}</small>`;

  const cl = document.getElementById('teachCloses');
  if (t.slots.every((a) => a === 'rest')) {
    cl.textContent = 'empty';
    cl.className = 'badge';
  } else {
    cl.textContent = t.preview.closes ? 'CLOSES' : 'TRAVELS';
    cl.className = `badge ${t.preview.closes ? 'closes' : 'drifts'}`;
  }

  renderPattern(t.slots, t.head, t.pending);
}

const VERB_GLYPH = { north: '↑', south: '↓', west: '←', east: '→', act: '●', rest: '' };

function renderPattern(slots, head, pending) {
  const el = document.getElementById('pattern');
  if (!slots) { el.innerHTML = ''; el.dataset.n = ''; return; }

  if (el.dataset.n !== String(slots.length)) {
    el.innerHTML = '';
    for (let i = 0; i < slots.length; i++) {
      const span = document.createElement('span');
      span.dataset.i = i;
      el.appendChild(span);
    }
    el.dataset.n = String(slots.length);
  }

  const kids = el.children;
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    const cls = [a === 'rest' ? 'rest' : isMove(a) ? 'move' : 'act'];
    if (app.teach && slotStartsBar(i, app.teach.bug.period)) cls.push('bar');
    if (i === head) cls.push('now');
    if (i === head + 1 && pending) cls.push('next');
    kids[i].className = cls.join(' ');
    kids[i].textContent = VERB_GLYPH[a] || '';
  }
}

// ---------------------------------------------------------------------------
// the beat circle

const beatEl = { ring: null, num: null };

function paintBeat() {
  if (!beatEl.ring) return;
  const since = app.tickDur - (app.nextTick - beatNow());
  const k = Math.max(0, Math.min(1, 1 - since / (app.tickDur * 0.85)));
  const pos = ((app.state.tick % TICKS_PER_BAR) + TICKS_PER_BAR) % TICKS_PER_BAR;
  const weight = pos === 0 ? 1 : pos % 2 === 0 ? 0.62 : 0.32;
  const glow = k * weight;

  beatEl.ring.style.transform = `scale(${(1 + 0.42 * glow).toFixed(3)})`;
  beatEl.ring.style.background = `rgba(224,201,138,${(0.09 + 0.72 * glow).toFixed(3)})`;
  beatEl.num.textContent = Math.floor(pos / 2) + 1;
  beatEl.num.style.color = glow > 0.45 ? '#141d0f' : '';
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

  app.state.tick++;
  app.audio.pulse(tAudio, app.state.tick % TICKS_PER_BAR === 0);

  if (app.mode === 'teach') {
    teachTick(tAudio, visNow());
  } else {
    const due = app.state.tick;
    app.queued = app.queued.filter((q) => {
      if (q.tick <= due) { q.fn(); return false; }
      return true;
    });
    advance(app.state, app.audio, tAudio, visNow(), fx);
    for (const b of app.state.bugs) {
      if (actsAt(b, app.state.tick) && app.state.sections[b.type].active) pingLane(b.type);
    }
  }
  app.nextTick += app.tickDur;
}

function frame() {
  const t = visNow();
  const s = app.state;
  const teach = app.teach;

  s.placing = app.mode === 'play' && s.supply[app.selected] > 0;

  for (const bug of s.bugs) {
    let fromX = bug.fromX;
    let fromY = bug.fromY;
    let toX = bug.x;
    let toY = bug.y;
    let at = bug.moveAt;
    if (teach && teach.bug === bug) {
      fromX = teach.fromG.x; fromY = teach.fromG.y;
      toX = teach.toG.x; toY = teach.toG.y;
      at = teach.gAt;
    }
    const k = Math.min(1, Math.max(0, (t - at) / GLIDE));
    const e = 1 - Math.pow(1 - k, 3);
    bug.visX = fromX + (toX - fromX) * e;
    bug.visY = fromY + (toY - fromY) * e;

    const target = (bug.dir * Math.PI) / 2;
    let d = target - bug.visDir;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    bug.visDir += d * 0.28;
  }

  s.particles = s.particles.filter((p) => t - p.at < p.life);
  paintBeat();
  draw(app.g, s, app.view, t, teach);
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
  beatEl.ring = document.querySelector('#beat .ring');
  beatEl.num = document.getElementById('beatNum');
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
  document.getElementById('teachClear').addEventListener('click', (e) => {
    e.currentTarget.blur();
    clearRoutine();
  });
  document.getElementById('teachClose').addEventListener('click', (e) => {
    e.currentTarget.blur();
    autoClose();
  });

  // click a slot to wipe it back to a rest
  document.getElementById('pattern').addEventListener('click', (e) => {
    const i = e.target.dataset && e.target.dataset.i;
    if (i == null || !app.teach) return;
    app.teach.slots[Number(i)] = 'rest';
    recompute(app.teach);
    refreshTeachUI();
  });

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
    flashBanner('drop a bug in the clearing');
  });
}

boot();
