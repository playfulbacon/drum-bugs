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

**Compose (about 70% of it).** Pick a bug from the tray, click the garden to
place it, and you drop straight into teaching. A metronome ticks at *that bug's*
subdivision and you drum the routine:

| key | verb |
|---|---|
| <kbd>W</kbd> / <kbd>↑</kbd> | step forward |
| <kbd>A</kbd> / <kbd>←</kbd> | turn left |
| <kbd>D</kbd> / <kbd>→</kbd> | turn right |
| <kbd>space</kbd> | act |
| *nothing* | rest |

The path preview draws as you go, and a badge tells you whether the loop
**CLOSES** — comes back to where it started, facing the same way — or **DRIFTS**.
Up to 16 slots; <kbd>Enter</kbd> finishes, <kbd>Esc</kbd> cancels.

`act` is context-sensitive: deliver if you're carrying and standing on the nest,
smash the rock in front, jump the water in front, kick the berry in front, or
pick up the berry underneath. That's why the preview can show you *where* the
bug goes without showing you what happens there.

**Conduct (about 30%).** Once routines are running you play them live, like a DJ:

| key | verb |
|---|---|
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> | cue a section in / cut it out |
| <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> | nudge a section one beat late |
| <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | accent a section's next action |

Cue and cut are quantised: hit the beat and it lands *now*, miss it and it waits
for the bar line. Precision buys immediacy — there is no way to fail.

Click a bug to re-teach it, shift-click to pick it up.

## The bugs

| Bug | Acts on | Sound | Special |
|---|---|---|---|
| **Cricket** | eighths | high dry ticks | jumps water, kicks berries two cells |
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
- **Geometry and meter rhyme.** Movement is turtle-relative, so a routine traces
  a shape. A loop that closes geometrically also closes musically.
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
