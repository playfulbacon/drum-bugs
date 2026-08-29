// The garden, the bugs, and what one tick of the clock does to them.
//
// Time is measured in ticks (eighth notes). A bug acts every `period` ticks:
// cricket 1, ant 2, beetle 4. Its routine is a fixed ring of actions that it
// walks through forever, one action per act.

export const COLS = 15;
export const ROWS = 7;
export const TICKS_PER_BAR = 8;
export const MAX_SLOTS = 32;
export const BAR_CHOICES = [1, 2, 4];
export const RIPEN_BARS = 4;

// Berries are the currency. Bugs are bought with them; a new nest is the big
// purchase that moves the frontier outward.
export const START_BERRIES = 10;
export const NEST_COST = 10;
export const NEST_GOAL = 3;
export const MIN_NEST_GAP = 4;

// Movement verbs are absolute, not relative. A movement always turns the bug
// to face that way, and moves it if the ground allows — which is why walking
// into a rock is how you aim at it.
export const DIR_OF = { east: 0, south: 1, west: 2, north: 3 };
export const MOVES = ['north', 'west', 'south', 'east'];

// . grass   R rock (beetle smashes)   ~ water (cricket jumps)
// N nest    b berry bush (regrows)
const LEVEL = [
  '.....R.....~...',
  '...b.R..b..~b.b',
  '..N..R.....~...',
  '...b.R..b..~b.b',
  '.....R.....~...',
  '.....R..b..~..b',
  '.....R.....~...',
];

export const BUGS = {
  cricket: {
    label: 'Cricket', period: 1, note: 'eighths', cost: 3,
    carries: false, jumps: true, kicks: true, smashes: false, builds: false,
    blurb: 'jumps water · kicks the berry underneath it',
  },
  ant: {
    label: 'Ant', period: 2, note: 'quarters', cost: 2,
    carries: true, jumps: false, kicks: false, smashes: false, builds: false,
    blurb: 'carries berries to any nest',
  },
  beetle: {
    label: 'Beetle', period: 4, note: 'halves', cost: 5,
    carries: false, jumps: false, kicks: false, smashes: true, builds: false,
    blurb: 'smashes the rock it faces',
  },
  termite: {
    label: 'Termite', period: 8, note: 'whole notes', cost: 6,
    carries: false, jumps: false, kicks: false, smashes: false, builds: true,
    blurb: `raises a new nest for ${NEST_COST} berries — then it is spent`,
  },
};

export const TYPES = ['cricket', 'ant', 'beetle', 'termite'];

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
      let bush = false;
      if (ch === 'b') { bush = true; berry = true; }
      cells.push({ x, y, t, bush, berry, ripeAt: null });
    }
  }

  const sections = {};
  for (const k of TYPES) sections[k] = { active: true };

  return {
    cells,
    nests: [nest],
    activeNest: 0,
    bugs: [],
    sections,
    tick: 0,
    berries: START_BERRIES,
    delivered: 0,
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

export function slotsForBars(bars, period) {
  return Math.max(1, Math.round((bars * TICKS_PER_BAR) / period));
}

export function nestAt(state, x, y) {
  return state.nests.findIndex((n) => n.x === x && n.y === y);
}

// Bugs are bought, and they crawl out of whichever nest is active. If that
// square is busy they emerge from the nearest free one.
export function spawnBug(state, type) {
  const spec = BUGS[type];
  if (state.berries < spec.cost) return null;
  const home = state.nests[state.activeNest] || state.nests[0];
  if (!home) return null;

  let spot = null;
  const ring = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const [dx, dy] of ring) {
    const c = cellAt(state, home.x + dx, home.y + dy);
    if (walkable(c) && !bugAt(state, c.x, c.y)) { spot = c; break; }
  }
  if (!spot) return null;

  state.berries -= spec.cost;
  return makeBug(state, spot.x, spot.y, type);
}

function makeBug(state, x, y, type) {
  const period = BUGS[type].period;
  const bug = {
    id: Math.random().toString(36).slice(2, 8),
    type,
    x, y,
    dir: 0,
    period,
    bars: 2,
    loop: new Array(slotsForBars(2, period)).fill('rest'),
    slot: 0,
    phase: 0,
    carrying: false,
    accented: false,
    accentPending: false,
    idle: 0,
    dozing: false,
    // render state
    visX: x, visY: y, fromX: x, fromY: y, moveAt: -10,
    actAt: -10, visDir: 0,
  };
  state.bugs.push(bug);
  return bug;
}

export function removeBug(state, bug, refund = true) {
  const i = state.bugs.indexOf(bug);
  if (i < 0) return;
  state.bugs.splice(i, 1);
  if (refund) state.berries += BUGS[bug.type].cost;
  if (bug.carrying) {
    const c = cellAt(state, bug.x, bug.y);
    if (c) c.berry = true;
  }
}

// A nest needs open ground with elbow room, so expansion is a real step out
// rather than a second doorway on the same patch.
export function canBuildNest(state, x, y) {
  const c = cellAt(state, x, y);
  if (!c || c.t !== 'grass' || c.bush) return false;
  return state.nests.every(
    (n) => Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) >= MIN_NEST_GAP,
  );
}

const mod = (n, m) => ((n % m) + m) % m;

// Timing is clock-locked: a bug acts on ticks that line up with its phase, and
// nudging just moves that phase. The slot it plays is a plain counter, so a
// nudge shifts *when* the routine runs without rotating *what* it does — the
// path the player was shown stays the path that runs.
export function actsAt(bug, tick) {
  return tick >= bug.phase && mod(tick - bug.phase, bug.period) === 0;
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

// A bush that has been picked comes back into fruit a few bars later, so a
// good fetch circuit stays a working machine instead of going stale.
export function takeBerry(state, cell) {
  cell.berry = false;
  if (cell.bush) cell.ripeAt = state.tick + RIPEN_BARS * TICKS_PER_BAR;
}

export function ripeness(state, cell) {
  if (!cell.bush || cell.berry || cell.ripeAt == null) return 0;
  const span = RIPEN_BARS * TICKS_PER_BAR;
  return Math.max(0, Math.min(1, 1 - (cell.ripeAt - state.tick) / span));
}

export function advance(state, audio, tAudio, tVis, fx) {
  for (const cell of state.cells) {
    if (!cell.bush || cell.berry || cell.ripeAt == null) continue;
    if (state.tick >= cell.ripeAt) {
      cell.berry = true;
      cell.ripeAt = null;
      audio.sprout(tAudio);
      fx.ripen(cell);
    }
  }

  for (const bug of state.bugs) {
    if (!state.sections[bug.type].active) continue;
    if (!actsAt(bug, state.tick)) continue;
    act(state, bug, bug.slot, audio, tAudio, tVis, fx);
    bug.slot = (bug.slot + 1) % bug.loop.length;
  }

  if (!state.won && state.nests.length >= NEST_GOAL) {
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

  let progress;
  if (action === 'act') {
    progress = resolveAct(state, bug, audio, tAudio, tVis, fx, accented);
  } else {
    const d = DIR_OF[action];
    if (d == null) return;
    bug.dir = d;
    const nx = bug.x + DX[d];
    const ny = bug.y + DY[d];
    const target = cellAt(state, nx, ny);
    progress = walkable(target) && !bugAt(state, nx, ny);
    if (progress) {
      moveTo(bug, nx, ny, tVis);
      audio.foot(bug.type, tAudio, i);
      fx.step(bug, accented);
    } else if (!bug.dozing) {
      // blocked: it still turned, which is how you line a bug up on something
      audio.bump(tAudio);
      fx.bump(bug);
    }
  }

  // A routine that achieves nothing for a whole lap goes quiet rather than
  // knocking against a wall forever. Any success wakes it straight back up.
  if (progress) {
    bug.idle = 0;
    if (bug.dozing) { bug.dozing = false; fx.wake(bug); }
  } else {
    bug.idle++;
    if (!bug.dozing && bug.idle >= Math.max(6, bug.loop.length)) {
      bug.dozing = true;
      fx.doze(bug);
    }
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

  // 1. deliver — any nest will take it
  if (bug.carrying && here && here.t === 'nest') {
    bug.carrying = false;
    state.delivered++;
    state.berries++;
    audio.boom(tAudio, i);
    fx.deliver(bug);
    return true;
  }

  // 2. raise a new nest. One time only — the termite is spent doing it.
  // Standing somewhere unbuildable just whiffs, like any other misplaced act.
  if (spec.builds && canBuildNest(state, bug.x, bug.y)) {
    if (state.berries < NEST_COST) {
      fx.tooPoor(bug);
      audio.whiff(tAudio);
      return false;
    }
    state.berries -= NEST_COST;
    here.t = 'nest';
    state.nests.push({ x: bug.x, y: bug.y });
    state.activeNest = state.nests.length - 1;
    audio.raise(tAudio);
    removeBug(state, bug, false);
    fx.build(here);
    return true;
  }

  // 3. smash the rock it faces (accented takes the one behind it too)
  if (spec.smashes && front && front.t === 'rock') {
    front.t = 'grass';
    if (accented) {
      const beyond = cellAt(state, fx1 + DX[bug.dir], fy1 + DY[bug.dir]);
      if (beyond && beyond.t === 'rock') { beyond.t = 'grass'; fx.smash(beyond); }
    }
    audio.crack(tAudio, i);
    fx.smash(front);
    return true;
  }

  // 4. jump the water it faces
  if (spec.jumps && front && front.t === 'water') {
    const land = cellAt(state, bug.x + DX[bug.dir] * 2, bug.y + DY[bug.dir] * 2);
    if (walkable(land) && !bugAt(state, land.x, land.y)) {
      moveTo(bug, land.x, land.y, tVis);
      audio.whoosh(tAudio, i);
      fx.jump(bug);
      return true;
    }
  }

  // 5. kick the berry underneath, two cells the way it faces (three when
  //    accented). It is airborne, so only where it lands matters.
  if (spec.kicks && here && here.berry) {
    const dist = accented ? 3 : 2;
    const land = cellAt(state, bug.x + DX[bug.dir] * dist, bug.y + DY[bug.dir] * dist);
    if (walkable(land) && !land.berry) {
      takeBerry(state, here);
      land.berry = true;
      land.ripeAt = null;
      audio.pop(tAudio, i);
      fx.kick(here, land);
      return true;
    }
  }

  // 6. pick up what it stands on
  if (spec.carries && !bug.carrying && here && here.berry) {
    takeBerry(state, here);
    bug.carrying = true;
    audio.pluck(tAudio, i);
    fx.pickup(bug);
    return true;
  }

  if (!bug.dozing) {
    audio.whiff(tAudio);
    fx.whiff(bug);
  }
  return false;
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

// ---------------------------------------------------------------------------
// Auto-close: the shortest way back to where the routine started, as verbs.
//
// Crickets get water crossings too — a jump is "move into the water, which is
// blocked so it only turns you, then act" — which costs two slots.

const VERB_OF = ['east', 'south', 'west', 'north'];

export function pathHome(state, bug, loop) {
  const pv = previewPath(state, bug, loop);
  const end = pv.path[pv.path.length - 1];
  if (end.x === bug.x && end.y === bug.y) return [];

  const key = (x, y) => y * COLS + x;
  const goal = key(bug.x, bug.y);
  const prev = new Map();
  const seen = new Set([key(end.x, end.y)]);
  const queue = [{ x: end.x, y: end.y }];
  const jumps = BUGS[bug.type].jumps;

  while (queue.length) {
    const cur = queue.shift();
    if (key(cur.x, cur.y) === goal) break;
    for (let d = 0; d < 4; d++) {
      const step = { x: cur.x + DX[d], y: cur.y + DY[d] };
      if (walkable(cellAt(state, step.x, step.y)) && !seen.has(key(step.x, step.y))) {
        seen.add(key(step.x, step.y));
        prev.set(key(step.x, step.y), { x: cur.x, y: cur.y, d, jump: false });
        queue.push(step);
      }
      if (!jumps) continue;
      const mid = cellAt(state, cur.x + DX[d], cur.y + DY[d]);
      const land = { x: cur.x + DX[d] * 2, y: cur.y + DY[d] * 2 };
      if (mid && mid.t === 'water' && walkable(cellAt(state, land.x, land.y))
          && !seen.has(key(land.x, land.y))) {
        seen.add(key(land.x, land.y));
        prev.set(key(land.x, land.y), { x: cur.x, y: cur.y, d, jump: true });
        queue.push(land);
      }
    }
  }

  if (!seen.has(goal)) return null;

  const out = [];
  let cur = { x: bug.x, y: bug.y };
  while (!(cur.x === end.x && cur.y === end.y)) {
    const p = prev.get(key(cur.x, cur.y));
    if (p.jump) out.unshift(VERB_OF[p.d], 'act');
    else out.unshift(VERB_OF[p.d]);
    cur = { x: p.x, y: p.y };
  }
  return out;
}
