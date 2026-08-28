# Changelog

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
