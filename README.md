# Drum Bugs

A rhythm-RTS prototype for the browser. You teach each bug a short routine by
drumming it. The bug loops that routine forever — and because every action makes
a sound, **its routine is its drum part**. Building the workforce is writing the
song.

Pikmin's delegation, Patapon's drumming, and a step sequencer, folded into one
act.

No build step, no dependencies. Static files, ES modules, Web Audio, one canvas.

## Playing

Best on a desktop with a keyboard.

**Compose (about 70% of it).** Bugs come out of the nest, so you can only drop
one in the lit clearing around it. Placing drops you straight into teaching. A
metronome ticks at *that bug's* subdivision and you drum the routine:

| key | verb |
|---|---|
| <kbd>W</kbd> / <kbd>↑</kbd> | move north |
| <kbd>A</kbd> / <kbd>←</kbd> | move west |
| <kbd>S</kbd> / <kbd>↓</kbd> | move south |
| <kbd>D</kbd> / <kbd>→</kbd> | move east |
| <kbd>space</kbd> | act |
| *nothing* | rest |

Directions are absolute, and a move always turns the bug even when the way is
blocked — so **you aim by walking into things**. Nose a beetle into a rock, then
act.

**The routine loops while you build it.** There is no count-in — recording starts
the moment you pick a bug up, riding the same clock the world does, so slot 0 of
every routine falls on a bar line and the playhead always agrees with the pulse.
The recorder goes round and round, the bug walking its path in ghost and snapping
back to the start each pass, so you can practise and adjust until it's right. Tap a slot in the strip to wipe it back
to a rest, `clear` to start over. Nothing commits until you **confirm**
(<kbd>Enter</kbd>); <kbd>Esc</kbd> cancels and puts the old routine back.

Loop length is set in bars — 1, 2 or 4 — and defaults to 2 bars for every bug, so
all the sections share a phrase length whatever their subdivision.

A badge tells you whether the loop **CLOSES** (comes back to where it started) or
**TRAVELS**. Travelling isn't a mistake: it's how you get a bug across the garden.
Re-teach it a closing routine once it arrives.

`act` is context-sensitive: deliver if you're carrying and standing on the nest,
smash the rock you face, jump the water you face, kick the berry underneath you,
or pick it up. That's why the preview can show you *where* the bug goes without
showing you what happens there.

**Conduct (about 30%).** Once routines are running you play them live, like a DJ:

| key | verb |
|---|---|
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> | cue a section in / cut it out |
| <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> | nudge a section one beat late |
| <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | accent a section's next action |

Cue and cut are quantised: hit the beat and it lands *now*, miss it and it waits
for the bar line. Precision buys immediacy — there is no way to fail. The pulsing
circle at the left of the HUD is the beat, swelling on the downbeat, with the
count in the bar inside it.

Click a bug to re-teach it, shift-click to pick it up.

## The bugs

| Bug | Acts on | Sound | Special |
|---|---|---|---|
| **Cricket** | eighths | high dry ticks | jumps water, kicks the berry underneath it two cells |
| **Ant** | quarters | mid woody knock | carries berries |
| **Beetle** | halves | low bass thud | smashes rock |

Their subdivision, their instrument, and their job are the same fact — so the
sections of the orchestra and the unit groups of the RTS never need to be
learned separately.

## Design notes

- **A loop is both a program and a drum part.** Neither Pikmin nor Patapon does
  this: the rhythm you drum becomes a persistent routine, so layering the
  workforce layers the arrangement.
- **Composing decides *what*; conducting decides *when and how hard*.** A real
  conductor doesn't change the notes — they control entrances, cutoffs and
  emphasis. Keeping to that split lets loops stay genuinely rigid while live
  play still has teeth.
- **Geometry and meter rhyme.** A routine traces a shape, and a loop that closes
  geometrically also closes musically. Because directions are absolute, the
  facing a routine settles on is the same every pass, so closure is purely a
  question of whether the path comes home.
- **Practice before you commit.** The recorder loops, so authoring a routine is
  a groove you settle into rather than a take you have to nail.
- **One grid for everything.** A bug's slot is derived from the world clock
  rather than counted down, so every bug and the recorder share a single grid.
  Confirming a routine drops the bug straight into the phrase already in
  progress instead of restarting it.
- **The nest is the downbeat.** Delivering a berry plays the bass drum, so tight
  logistics literally land on the one. You can hear whether your economy is
  running well.

## What this prototype is for

It exists to answer four questions, and everything else was cut:

1. Is drumming a routine, with a live path preview, actually pleasant?
2. Do layered loops on different subdivisions sound like music or like mush?
3. Is live conducting satisfying?
4. Does composing a path feel like the same act as composing a rhythm?

Deliberately absent: enemies, predators that hunt by sound, the pollinator
melody layer, drift and re-syncing, day cycle and weather, progression, and
bugs teaching each other.

## Running locally

ES modules need to be served over HTTP, so `file://` will not work:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main`. Enable Pages for the repo with **Source: GitHub Actions**.

## Layout

```
index.html      title screen + canvas + hud
css/style.css
js/version.js   VERSION — bump on every iteration
js/audio.js     synthesised foley; one footfall timbre per bug type
js/game.js      the garden, the tick, and what each action resolves to
js/render.js    canvas drawing, including the routine preview
js/main.js      clocks, the teaching recorder, conducting, the loop
```

`window.DB` exposes `{ app, layout }` in the console for poking at a running
garden.
