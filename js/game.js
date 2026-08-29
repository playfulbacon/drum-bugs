// The garden, the bugs, and what one tick of the clock does to them.
//
// Time is measured in ticks (eighth notes). A bug acts every `period` ticks:
// cricket 1, ant 2, beetle 4. Its routine is a fixed ring of actions that it
// walks through forever, one action per act.

export const COLS = 15;
export const ROWS = 7;
export const TICKS_PER_BAR = 8;
export const MAX_SLOTS = 32;
export const SPAWN_RADIUS = 2;
export const BAR_CHOICES = [1, 2, 4];

// Movement verbs are absolute, not relative. A movement always turns the bug
// to face that way, and moves it if the ground allows — which is why walking
// into a rock is how you aim at it.
export const DIR_OF = { east: 0, south: 1, west: 2, north: 3 };
export const MOVES = ['north', 'west', 'south', 'east'];

// . grass   R rock (beetle smashes)   ~ water (cricket jumps)
// N nest    b berry
const LEVEL = [
  '.....R.....~...',
  '...b.R..b..~b..',
  '..N..R.....~...',
  '...b.R..b..~b..',
  '.....R.....~...',
  '.....R..b..~...',
  '.....R.....~...',
];

export const BUGS = {
  cricket: {
    label: 'Cricket', period: 1, note: 'eighths', supply: 3,
    carries: false, jumps: true, kicks: true, smashes: false,
    blurb: 'jumps water · kicks the berry underneath it',
  },
  ant: {
    label: 'Ant', period: 2, note: 'quarters', supply: 4,
    carries: true, jumps: false, kicks: false, smashes: false,
    blurb: 'carries berries home',
  },
  beetle: {
    label: 'Beetle', period: 4, note: 'halves', supply: 2,
    carries: false, jumps: false, kicks: false, smashes: true,
    blurb: 'smashes the rock it faces',
  },
};

export const TYPES = ['cricket', 'ant', 'beetle'];

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

export function createState() {
  const cells = [];
  let nest = { x: 2, y: 2 };
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = LEVEL[y][x];
      let t = 'grass';
      let berry = false;
      if (ch === 'R') t = 'rock';
      else if (ch === '~') t = 'water';
      else if (ch === 'N') { t = 'nest'; nest = { x, y }; }
      else if (ch === 'b') berry = true;
      cells.push({ x, y, t, berry });
    }
  }

  const supply = {};
  for (const k of TYPES) supply[k] = BUGS[k].supply;
  const sections = {};
  for (const k of TYPES) sections[k] = { active: true };

  return {
    cells,
    nest,
    bugs: [],
    supply,
    sections,
    tick: 0,
    delivered: 0,
    totalBerries: cells.filter((c) => c.berry).length,
    particles: [],
    hover: null,
    won: false,
  };
}

export function cellAt(state, x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
  return state.cells[y * COLS + x];
}

export function bugAt(state, x, y) {
  return state.bugs.find((b) => b.x === x && b.y === y) || null;
}

export function walkable(cell) {
  return !!cell && (cell.t === 'grass' || cell.t === 'nest');
}

// Bugs come out of the nest, so they can only be dropped in the clearing
// around it. Where they go after that is the routine's problem.
export function inSpawn(state, x, y) {
  return Math.max(Math.abs(x - state.nest.x), Math.abs(y - state.nest.y)) <= SPAWN_RADIUS;
}

export function slotsForBars(bars, period) {
  return Math.max(1, Math.round((bars * TICKS_PER_BAR) / period));
}

export function placeBug(state, x, y, type) {
  const cell = cellAt(state, x, y);
  if (!walkable(cell) || bugAt(state, x, y)) return null;
  if (!inSpawn(state, x, y)) return null;
  if (state.supply[type] <= 0) return null;
  state.supply[type]--;
  const period = BUGS[type].period;
  const bug = {
    id: Math.random().toString(36).slice(2, 8),
    type,
    x, y,
    dir: 0,
    period,
    bars: 2,
    loop: new Array(slotsForBars(2, period)).fill('rest'),
    phase: 0,
    carrying: false,
    accented: false,
    accentPending: false,
    // render state
    visX: x, visY: y, fromX: x, fromY: y, moveAt: -10,
    actAt: -10, visDir: 0,
  };
  state.bugs.push(bug);
  return bug;
}

export function removeBug(state, bug) {
  const i = state.bugs.indexOf(bug);
  if (i < 0) return;
  state.bugs.splice(i, 1);
  state.supply[bug.type]++;
  if (bug.carrying) {
    const c = cellAt(state, bug.x, bug.y);
    if (c) c.berry = true;
  }
}

const mod = (n, m) => ((n % m) + m) % m;

// A bug's slot is derived from the world clock rather than counted down, so
// every bug — and the teaching recorder — sits on one shared grid. Slot 0 of a
// routine always lands on a bar line.
export function actsAt(bug, tick) {
  return mod(tick - bug.phase, bug.period) === 0;
}

export function slotAt(bug, tick) {
  return mod(Math.floor((tick - bug.phase) / bug.period), bug.loop.length);
}

export function slotStartsBar(i, period) {
  return (i * period) % TICKS_PER_BAR === 0;
}

export function nextBarTick(tick) {
  return (Math.floor(tick / TICKS_PER_BAR) + 1) * TICKS_PER_BAR;
}

// ---------------------------------------------------------------------------
// One tick of the world. The caller advances state.tick, so the metronome keeps
// running while a routine is being taught.

export function advance(state, audio, tAudio, tVis, fx) {
  for (const bug of state.bugs) {
    if (!state.sections[bug.type].active) continue;
    if (!actsAt(bug, state.tick)) continue;
    act(state, bug, slotAt(bug, state.tick), audio, tAudio, tVis, fx);
  }

  if (!state.won && state.delivered >= state.totalBerries) {
    state.won = true;
    audio.chime(tAudio + 0.1);
    fx.win();
  }
}

function act(state, bug, slot, audio, tAudio, tVis, fx) {
  const action = bug.loop[slot] || 'rest';

  // An accent waits on the bug until its next action, so you conduct the
  // section rather than having to hit each bug's own subdivision.
  const accented = !!bug.accentPending;
  bug.accentPending = false;
  bug.accented = accented;
  const i = accented ? 1.5 : 1;

  bug.actAt = tVis;

  if (action === 'rest') return;

  if (action === 'act') {
    resolveAct(state, bug, audio, tAudio, tVis, fx, accented);
    return;
  }

  const d = DIR_OF[action];
  if (d == null) return;
  bug.dir = d;
  const nx = bug.x + DX[d];
  const ny = bug.y + DY[d];
  const target = cellAt(state, nx, ny);
  if (walkable(target) && !bugAt(state, nx, ny)) {
    moveTo(bug, nx, ny, tVis);
    audio.foot(bug.type, tAudio, i);
    fx.step(bug, accented);
  } else {
    // blocked: it still turned, which is how you line a bug up on something
    audio.bump(tAudio);
    fx.bump(bug);
  }
}

function moveTo(bug, x, y, tVis) {
  bug.fromX = bug.x;
  bug.fromY = bug.y;
  bug.x = x;
  bug.y = y;
  bug.moveAt = tVis;
}

// `act` is context-sensitive: it means whatever makes sense for what the bug
// faces, or what it stands on. That is what lets a routine be taught without
// knowing exactly what it will meet.
function resolveAct(state, bug, audio, tAudio, tVis, fx, accented) {
  const spec = BUGS[bug.type];
  const i = accented ? 1.5 : 1;
  const here = cellAt(state, bug.x, bug.y);
  const fx1 = bug.x + DX[bug.dir];
  const fy1 = bug.y + DY[bug.dir];
  const front = cellAt(state, fx1, fy1);

  // 1. deliver
  if (bug.carrying && here && here.t === 'nest') {
    bug.carrying = false;
    state.delivered++;
    audio.boom(tAudio, i);
    fx.deliver(bug);
    return;
  }

  // 2. smash the rock it faces (accented takes the one behind it too)
  if (spec.smashes && front && front.t === 'rock') {
    front.t = 'grass';
    if (accented) {
      const beyond = cellAt(state, fx1 + DX[bug.dir], fy1 + DY[bug.dir]);
      if (beyond && beyond.t === 'rock') { beyond.t = 'grass'; fx.smash(beyond); }
    }
    audio.crack(tAudio, i);
    fx.smash(front);
    return;
  }

  // 3. jump the water it faces
  if (spec.jumps && front && front.t === 'water') {
    const land = cellAt(state, bug.x + DX[bug.dir] * 2, bug.y + DY[bug.dir] * 2);
    if (walkable(land) && !bugAt(state, land.x, land.y)) {
      moveTo(bug, land.x, land.y, tVis);
      audio.whoosh(tAudio, i);
      fx.jump(bug);
      return;
    }
  }

  // 4. kick the berry underneath, two cells the way it faces (three when
  //    accented). It is airborne, so only where it lands matters.
  if (spec.kicks && here && here.berry) {
    const dist = accented ? 3 : 2;
    const land = cellAt(state, bug.x + DX[bug.dir] * dist, bug.y + DY[bug.dir] * dist);
    if (walkable(land) && !land.berry) {
      here.berry = false;
      land.berry = true;
      audio.pop(tAudio, i);
      fx.kick(here, land);
      return;
    }
  }

  // 5. pick up what it stands on
  if (spec.carries && !bug.carrying && here && here.berry) {
    here.berry = false;
    bug.carrying = true;
    audio.pluck(tAudio, i);
    fx.pickup(bug);
    return;
  }

  audio.whiff(tAudio);
  fx.whiff(bug);
}

// ---------------------------------------------------------------------------
// Preview: walk a routine through the terrain without touching anything.
//
// Because movement is absolute, the facing a routine ends on is the same on
// every pass. We settle that first so the previewed path is the steady-state
// one, not a one-off first lap.

export function previewPath(state, bug, loop) {
  let dir = bug.dir;
  for (const a of loop) if (DIR_OF[a] != null) dir = DIR_OF[a];
  const startDir = dir;

  let x = bug.x;
  let y = bug.y;
  const path = [{ x, y, dir }];

  for (const a of loop) {
    if (DIR_OF[a] != null) {
      dir = DIR_OF[a];
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (walkable(cellAt(state, nx, ny))) { x = nx; y = ny; }
    } else if (a === 'act' && BUGS[bug.type].jumps) {
      // jumping is the only act that moves, and terrain makes it predictable
      const front = cellAt(state, x + DX[dir], y + DY[dir]);
      const land = cellAt(state, x + DX[dir] * 2, y + DY[dir] * 2);
      if (front && front.t === 'water' && walkable(land)) { x = land.x; y = land.y; }
    }
    path.push({ x, y, dir });
  }

  return { path, closes: x === bug.x && y === bug.y, startDir };
}
