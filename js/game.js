// The garden, the bugs, and what one tick of the clock does to them.
//
// Time is measured in ticks (eighth notes). A bug acts every `period` ticks:
// cricket 1, ant 2, beetle 4. Its routine is a fixed list of actions that it
// walks through forever, one action per act.

export const COLS = 15;
export const ROWS = 7;
export const TICKS_PER_BAR = 8;
export const MAX_SLOTS = 16;

export const ACTIONS = ['step', 'left', 'right', 'act', 'rest'];

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
    blurb: 'jumps water, kicks berries',
  },
  ant: {
    label: 'Ant', period: 2, note: 'quarters', supply: 4,
    carries: true, jumps: false, kicks: false, smashes: false,
    blurb: 'carries berries home',
  },
  beetle: {
    label: 'Beetle', period: 4, note: 'halves', supply: 2,
    carries: false, jumps: false, kicks: false, smashes: true,
    blurb: 'smashes rock',
  },
};

export const TYPES = ['cricket', 'ant', 'beetle'];

// East, South, West, North
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
  for (const k of TYPES) sections[k] = { active: true, accent: false, flash: -10 };

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

export function placeBug(state, x, y, type) {
  const cell = cellAt(state, x, y);
  if (!walkable(cell) || bugAt(state, x, y)) return null;
  if (state.supply[type] <= 0) return null;
  state.supply[type]--;
  const bug = {
    id: Math.random().toString(36).slice(2, 8),
    type,
    x, y,
    dir: 0,
    period: BUGS[type].period,
    loop: ['rest'],
    slot: 0,
    ticksToNext: 1,
    carrying: false,
    accented: false,
    accentPending: false,
    // render state
    visX: x, visY: y, fromX: x, fromY: y, moveAt: -10,
    actAt: -10, actKind: null, visDir: 0,
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

// Align a bug so its next action lands on the given tick.
export function alignTo(bug, fromTick, targetTick) {
  bug.ticksToNext = Math.max(1, targetTick - fromTick);
}

export function nextBarTick(tick) {
  return (Math.floor(tick / TICKS_PER_BAR) + 1) * TICKS_PER_BAR;
}

// ---------------------------------------------------------------------------
// One tick of the world.

export function advance(state, audio, tAudio, tVis, fx) {
  state.tick++;
  const onBar = state.tick % TICKS_PER_BAR === 0;
  audio.pulse(tAudio, onBar);

  for (const bug of state.bugs) {
    if (!state.sections[bug.type].active) continue;
    bug.ticksToNext--;
    if (bug.ticksToNext > 0) continue;
    bug.ticksToNext = bug.period;
    act(state, bug, audio, tAudio, tVis, fx);
  }

  if (!state.won && state.delivered >= state.totalBerries) {
    state.won = true;
    audio.chime(tAudio + 0.1);
    fx.win();
  }
}

function act(state, bug, audio, tAudio, tVis, fx) {
  const action = bug.loop[bug.slot] || 'rest';
  bug.slot = (bug.slot + 1) % bug.loop.length;

  // An accent waits on the bug until its next action, so you conduct the
  // section rather than having to hit each bug's own subdivision.
  const accented = !!bug.accentPending;
  bug.accentPending = false;
  bug.accented = accented;
  const i = accented ? 1.5 : 1;

  bug.actAt = tVis;
  bug.actKind = action;

  switch (action) {
    case 'rest':
      break;

    case 'left':
    case 'right': {
      bug.dir = (bug.dir + (action === 'left' ? 3 : 1)) % 4;
      audio.scrape(tAudio, i * 0.9);
      break;
    }

    case 'step': {
      const nx = bug.x + DX[bug.dir];
      const ny = bug.y + DY[bug.dir];
      const target = cellAt(state, nx, ny);
      if (walkable(target) && !bugAt(state, nx, ny)) {
        moveTo(bug, nx, ny, tVis);
        audio.foot(bug.type, tAudio, i);
        fx.step(bug, accented);
      } else {
        audio.bump(tAudio);
        fx.bump(bug);
      }
      break;
    }

    case 'act':
      resolveAct(state, bug, audio, tAudio, tVis, fx, accented);
      break;
  }
}

function moveTo(bug, x, y, tVis) {
  bug.fromX = bug.x;
  bug.fromY = bug.y;
  bug.x = x;
  bug.y = y;
  bug.moveAt = tVis;
}

// `act` is context-sensitive: it means whatever makes sense for what is in
// front of the bug, or under it. That is what lets the routine be taught
// without knowing exactly what it will meet.
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

  // 2. smash rock (accented smashes the one behind it too)
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

  // 3. jump water
  if (spec.jumps && front && front.t === 'water') {
    const land = cellAt(state, bug.x + DX[bug.dir] * 2, bug.y + DY[bug.dir] * 2);
    if (walkable(land) && !bugAt(state, land.x, land.y)) {
      moveTo(bug, land.x, land.y, tVis);
      audio.whoosh(tAudio, i);
      fx.jump(bug);
      return;
    }
  }

  // 4. kick a berry two cells further on (three when accented). It is airborne,
  //    so what it passes over does not matter — only where it lands.
  if (spec.kicks && front && front.berry) {
    const dist = accented ? 3 : 2;
    const land = cellAt(state, fx1 + DX[bug.dir] * dist, fy1 + DY[bug.dir] * dist);
    if (walkable(land) && !land.berry) {
      front.berry = false;
      land.berry = true;
      audio.pop(tAudio, i);
      fx.kick(front, land);
      return;
    }
  }

  // 5. pick up what you are standing on
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
// Preview: walk a routine through the terrain without touching anything, so
// the player can see the shape of the path while composing it.

export function previewPath(state, bug, loop) {
  const spec = BUGS[bug.type];
  let x = bug.x;
  let y = bug.y;
  let dir = bug.dir;
  const path = [{ x, y, dir, slot: -1 }];

  for (let s = 0; s < loop.length; s++) {
    const a = loop[s];
    if (a === 'left') dir = (dir + 3) % 4;
    else if (a === 'right') dir = (dir + 1) % 4;
    else if (a === 'step') {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (walkable(cellAt(state, nx, ny))) { x = nx; y = ny; }
    } else if (a === 'act' && spec.jumps) {
      // jumping is the only act that moves, and terrain makes it predictable
      const front = cellAt(state, x + DX[dir], y + DY[dir]);
      const land = cellAt(state, x + DX[dir] * 2, y + DY[dir] * 2);
      if (front && front.t === 'water' && walkable(land)) { x = land.x; y = land.y; }
    }
    path.push({ x, y, dir, slot: s });
  }

  const closes = x === bug.x && y === bug.y && dir === bug.dir;
  return { path, closes };
}
