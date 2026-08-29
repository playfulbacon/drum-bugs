# Changelog

## v0.5 — "the harvest"

- **Berry bushes regrow.** A picked bush comes back into fruit four bars later,
  with a bud that visibly swells as it ripens. The goal is now a quota (15
  deliveries) rather than clearing a fixed set, so a good fetch circuit is a
  machine that keeps earning instead of a routine that goes stale after one use.
- **Stuck travellers go quiet.** A bug that achieves nothing for a whole lap
  stops making its failure noises, dims, and puffs a few sleep motes. Any
  success — including the world changing around it — wakes it instantly.
- **Auto-close.** A `close loop` button fills the trailing rests with the
  shortest walk back to the start. It understands cricket water crossings (move
  into the water to turn, then act to jump), and tells you if there isn't room
  or if there is no way home on foot.

**Two real bugs fixed, both about routines not running as taught:**

- A bug's slot used to be derived from the world clock, so on confirming a
  routine it joined *mid-loop* and traced a rotated, wrong path — the ant fetch
  circuit silently never picked anything up. Timing is still clock-locked via
  `phase`, but the slot is a plain counter now, so a nudge shifts *when* a
  routine runs without rotating *what* it does.
- The teaching recorder filled its ring at whatever offset the world clock
  happened to be on, so the first thing you drummed rarely became slot 0. The
  ring is now anchored to the moment you pick the bug up, while slot boundaries
  still sit on world ticks — so the playhead stays locked to the pulse and what
  you teach is what runs.

## v0.4 — "one grid"

- **No count-in.** Teaching starts recording immediately, on whatever beat the
  world is already on.
- **The recorder rides the world clock.** A bug's slot is now derived from
  `state.tick` rather than counted down privately, so the teaching playhead, the
  pulsing beat marker and every running bug all sit on one grid. Slot 0 of a
  routine always lands on a bar line, and the pattern strip marks where each bar
  begins.
- **Confirming keeps the phrase.** A finished routine takes `phase = 0`, so the
  bug joins the phrase already in progress rather than restarting it — parts stay
  locked to each other. Cueing a section back in resumes on the grid for the same
  reason. Nudge is now a phase offset, which is what it always meant.

## v0.3 — "true north"

Four changes to how a routine is authored, all of them making the composing half
less of a memory test.

- **The beat is visible.** A circle in the HUD pulses on every eighth, swelling
  on the downbeat, with the count in the bar inside it. During a count-in it
  shows the count instead.
- **Movement is absolute, not relative.** <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
  are north / west / south / east rather than step and turn. A move always turns
  the bug even when the way is blocked, which makes *walking into things* the way
  you aim — nose a beetle at a rock, then act. Because facing is now fully
  determined by the routine, the preview settles it before drawing, so what you
  see is the steady-state lap rather than a one-off first pass, and CLOSES is
  purely a question of whether the path comes home.
- **Bugs come out of the nest.** There is a clearing around the nest, lit while
  you are holding a bug, and that is the only place one can be dropped. Getting
  a bug anywhere else is now the routine's job — which is what makes a
  *travelling* routine useful rather than a mistake, so the badge says TRAVELS
  instead of DRIFTS.
- **The recorder loops.** A routine plays round and round while you build it,
  the bug walking its path in ghost and snapping back to the start each pass, so
  you can practise before committing. Confirm and cancel are explicit, `clear`
  wipes the pattern, and tapping a slot in the strip resets it to a rest.
  Nothing touches the live bug until you confirm.

Also: loop length is now set in bars (1 / 2 / 4) rather than raw slots, and
defaults to 2 bars for every bug — so a cricket's 16 eighths, an ant's 8 quarters
and a beetle's 4 halves are all the same phrase. The cricket now kicks the berry
it is standing on rather than the one in front, since absolute movement means you
can no longer face a berry without stepping onto it.

## v0.2 — "the routine"

A full pivot, following the Pikmin + Patapon conversation. The v0.1 toy is gone;
only the audio approach survives. This is a game about teaching bugs looping
routines that are simultaneously their drum parts.

**In:**
- **Teaching by drumming.** Place a bug and a metronome starts at that bug's own
  subdivision. Drum the routine with four verbs — step, turn left, turn right,
  act — and silence records a rest. Up to 16 slots, you choose when to close it.
- **Live path preview** while composing, with a **CLOSES / DRIFTS** readout, so
  you can see the shape of a loop without holding it in your head. Environmental
  consequences stay hidden, as designed.
- **Three bugs on three subdivisions.** Cricket (eighths, jumps water, kicks
  berries), Ant (quarters, carries), Beetle (halves, smashes rock). Polyrhythm
  falls out of the roster.
- **Context-sensitive `act`** — deliver, smash, jump, kick, or pick up depending
  on what's in front of or under the bug. One verb, five meanings.
- **Conducting.** Cue sections in and out, nudge them a beat late, accent their
  next action, ride the tempo. Quantised so loose input lands on the next bar
  and dead-on input lands immediately: precision buys immediacy, never accuracy.
- **The nest is the downbeat** — a delivery plays the bass drum.
- One garden that needs all three bug types: berries in the open, berries behind
  a rock wall, berries stranded across water.
- Accents amplify actions without breaking geometry — an accented smash takes
  out the rock behind it, an accented kick sends a berry a cell further.

**Fixed during the build:**
- A kick computed its landing square from the bug rather than the berry, so
  berries fell in the water instead of clearing it.
- `.panel { display: flex }` overrode the `hidden` attribute, showing the teach
  and play HUDs at once.

**Deliberately out of scope:**
Enemies and phase-dodging; sound attracting predators; the pollinator melody
layer; drift and re-syncing; day cycle, weather, seasons; economy and
progression; bugs mishearing or teaching each other. All still on the table.

## v0.1 — "first crawl"

The original toy: bugs walking a forest floor in silence, sounding whatever they
walk over, with a timed stomp that cracked seeds into flowers. Superseded by the
v0.2 pivot, but its synthesised-foley audio engine carried forward.
