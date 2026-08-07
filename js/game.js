// Field state, bug movement, and what happens when a stomp lands.

// Narrow screens get a shorter field so cells stay big enough to tap. Set once
// at boot, before the state is built.
export let COLS = 13;
export const ROWS = 5;

export function setCols(n) {
  COLS = n;
}
export const STEPS_PER_BAR = 4;
export const BARS_PER_GUST = 8;

// Timing windows, in seconds either side of the beat.
export const WINDOW_CRACK = 0.06;
export const WINDOW_GOOD = 0.15;

export const TERRAIN = {
  bare:   { voice: null,     soft: 0,    label: 'bare earth' },
  leaf:   { voice: 'leaf',   soft: 0.30, label: 'dry leaf' },
  puddle: { voice: 'puddle', soft: 0.26, label: 'puddle' },
  log:    { voice: 'log',    soft: 0.34, label: 'hollow log' },
  stone:  { voice: 'stone',  soft: 0.26, label: 'stone' },
  moss:   { voice: 'moss',   soft: 0.34, label: 'moss' },
  soil:   { voice: 'soil',   soft: 0.24, label: 'soft soil' },
};

// What grows where. The ground decides — carry a seed to the water for
// something splashy, to the wood for something hollow.
export const FLOWER_BY_TERRAIN = {
  puddle: 'dew',
  log:    'pod',
  leaf:   'pod',
  stone:  'crystal',
  moss:   'bloom',
  soil:   'bloom',
  bare:   'bloom',
};

export const BUGS = {
  snail:   { period: 3, tone: 0.85, soft: 0.20, label: 'Snail',   hint: 'every 3 beats' },
  beetle:  { period: 2, tone: 0.68, soft: 0.32, label: 'Beetle',  hint: 'every 2 beats' },
  cricket: { period: 1, tone: 1.28, soft: 0.16, label: 'Cricket', hint: 'every beat' },
};

// C major pentatonic, bottom lane lowest.
const LANE_SEMITONES = [21, 16, 12, 7, 0];
const BASE_FREQ = 220;

export function laneFreq(row) {
  const semi = LANE_SEMITONES[row] ?? 0;
  return BASE_FREQ * Math.pow(2, semi / 12);
}

function rand(n) {
  return Math.floor(Math.random() * n);
}

export function createState() {
  const state = {
    cells: [],
    bugs: [],
    step: 0,
    particles: [],
    flashes: [],
    gustAt: -1,
    hoverLane: null,
    lastQuality: null,
  };
  for (let r = 0; r < ROWS; r++) {
    for (let x = 0; x < COLS; x++) {
      state.cells.push({ x, r, terrain: 'bare', seed: false, flower: null, hit: 0 });
    }
  }
  generateField(state);
  scatterSeeds(state, 11);
  return state;
}

export function cellAt(state, x, r) {
  if (x < 0 || x >= COLS || r < 0 || r >= ROWS) return null;
  return state.cells[r * COLS + x];
}

// Clustered rather than uniform, so the field reads as a place.
function generateField(state) {
  const blob = (kind, count, maxRun) => {
    for (let n = 0; n < count; n++) {
      const r = rand(ROWS);
      const x = rand(COLS);
      const run = 1 + rand(maxRun);
      for (let k = 0; k < run; k++) {
        const c = cellAt(state, x + k, r);
        if (c && c.terrain === 'bare') c.terrain = kind;
      }
    }
  };

  blob('log', 3, 3);
  blob('puddle', 3, 2);
  blob('moss', 4, 2);
  blob('leaf', 7, 2);
  blob('soil', 4, 2);
  for (let n = 0; n < 5; n++) {
    const c = cellAt(state, rand(COLS), rand(ROWS));
    if (c && c.terrain === 'bare') c.terrain = 'stone';
  }
}

export function scatterSeeds(state, count) {
  const open = state.cells.filter((c) => !c.seed && !c.flower);
  for (let n = 0; n < count && open.length; n++) {
    const i = rand(open.length);
    open[i].seed = true;
    open.splice(i, 1);
  }
}

export function bugInLane(state, r) {
  return state.bugs.find((b) => b.r === r) || null;
}

export function placeBug(state, r, type) {
  if (bugInLane(state, r)) return null;
  const spec = BUGS[type];
  const bug = {
    r,
    x: rand(COLS),
    dir: Math.random() < 0.5 ? 1 : -1,
    type,
    period: spec.period,
    phase: 0,
    carrying: false,
    // render state
    visX: 0,
    fromX: 0,
    moveAt: -10,
    stompAt: -10,
    stompQuality: null,
  };
  bug.visX = bug.x;
  bug.fromX = bug.x;
  state.bugs.push(bug);
  return bug;
}

export function removeBug(state, r) {
  const i = state.bugs.findIndex((b) => b.r === r);
  if (i >= 0) return state.bugs.splice(i, 1)[0];
  return null;
}

export function qualityFromOffset(offset) {
  const a = Math.abs(offset);
  if (a < WINDOW_CRACK) return 'crack';
  if (a < WINDOW_GOOD) return 'good';
  return 'thud';
}

const QUALITY_GAIN = { crack: 1.0, good: 0.78, thud: 0.48 };

// ---------------------------------------------------------------------------
// The step. Bugs due this beat move one cell; blocked at the ends, they turn.

export function advance(state, audio, tAudio, tVis, effects) {
  state.step++;
  const bar = Math.floor(state.step / STEPS_PER_BAR);
  const onDownbeat = state.step % STEPS_PER_BAR === 0;

  audio.pulse(tAudio, onDownbeat);

  if (onDownbeat && bar > 0 && bar % BARS_PER_GUST === 0 && state.gustAt !== bar) {
    state.gustAt = bar;
    audio.wind(tAudio);
    scatterSeeds(state, 3 + rand(3));
    effects.gust();
  }

  for (const bug of state.bugs) {
    let moved = false;
    bug.phase++;
    if (bug.phase >= bug.period) {
      bug.phase = 0;
      let nx = bug.x + bug.dir;
      if (nx < 0 || nx >= COLS) {
        bug.dir *= -1;
        nx = bug.x + bug.dir;
      }
      bug.fromX = bug.x;
      bug.x = nx;
      bug.moveAt = tVis;
      moved = true;
    }

    const cell = cellAt(state, bug.x, bug.r);
    const pending = bug.pendingStomp;
    bug.pendingStomp = null;

    // A stomp lands on any beat, whether or not the bug stepped — it just
    // stomps where it stands.
    if (pending) {
      stompBug(state, audio, bug, tAudio, tVis, pending, effects);
    } else if (moved) {
      // Otherwise it brushes over the ground, and pockets any seed it finds.
      touch(state, audio, bug, cell, tAudio, effects);
      if (cell.seed && !bug.carrying) {
        cell.seed = false;
        bug.carrying = true;
        effects.pickup(bug, cell);
      }
    }
  }
}

function touch(state, audio, bug, cell, tAudio, effects) {
  const spec = BUGS[bug.type];
  const t = TERRAIN[cell.terrain];
  if (cell.flower) {
    audio.flower(tAudio, laneFreq(bug.r), spec.soft * 0.9, cell.flower.kind);
    effects.ripple(cell, 0.4, cell.flower.color);
  }
  if (t.voice) {
    audio[t.voice](tAudio, spec.soft, spec.tone);
    effects.ripple(cell, 0.3);
  }
}

// The one verb. Always a loud hit; a carried seed just makes it leave
// something behind.
export function stompBug(state, audio, bug, tAudio, tVis, quality, effects) {
  const cell = cellAt(state, bug.x, bug.r);
  const spec = BUGS[bug.type];
  const gain = QUALITY_GAIN[quality];
  const t = TERRAIN[cell.terrain];

  audio._thump(tAudio, gain * 0.9);
  if (t.voice) audio[t.voice](tAudio, gain, spec.tone);
  else audio.bare(tAudio, gain);

  bug.stompAt = tVis;
  bug.stompQuality = quality;
  state.lastQuality = { quality, at: tVis, r: bug.r };
  cell.hit++;

  let planted = null;
  if (bug.carrying) {
    bug.carrying = false;
    planted = plant(state, cell, quality);
  } else if (cell.seed) {
    cell.seed = false;
    planted = plant(state, cell, quality);
  }

  if (planted) {
    audio.flower(tAudio + 0.03, laneFreq(bug.r), gain, planted.kind);
  } else if (cell.flower) {
    audio.flower(tAudio, laneFreq(bug.r), gain * 0.9, cell.flower.kind);
  }

  effects.stomp(bug, cell, quality, planted);
}

const FLOWER_COLORS = {
  bloom:   '#e8a0b8',
  dew:     '#9fd8e6',
  pod:     '#d9b473',
  crystal: '#c9bbe8',
};

function plant(state, cell, quality) {
  const kind = FLOWER_BY_TERRAIN[cell.terrain] || 'bloom';
  const size = quality === 'crack' ? 1 : quality === 'good' ? 0.78 : 0.55;
  cell.flower = {
    kind,
    size,
    color: FLOWER_COLORS[kind],
    bornAt: state.step,
    sway: Math.random() * Math.PI * 2,
  };
  return cell.flower;
}
