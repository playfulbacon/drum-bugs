# Drum Bugs

A rhythm toy for the browser. Bugs walk a patch of forest floor in silence — what
they walk *over* is what makes the sound.

No build step, no dependencies. Static files, ES modules, Web Audio, one canvas.

## Playing

- **Click an empty lane** to set a bug walking. It turns around at the edges.
- **Click a lane with a bug** to make it **stomp** — a loud hit on whatever it is
  standing on. Keys <kbd>1</kbd>–<kbd>5</kbd> do the same, top lane to bottom.
- **Stomp on the beat.** Off-beat still works, it is just a thud. Land it and you
  get a *crack*.
- **Seeds** lie scattered around. Stomp one to crack it open where it is — or
  leave it and the bug pockets it and carries it somewhere better.
- **Stomping while carrying** plants a flower. Where you plant decides what
  grows: water grows something splashy, wood something hollow, stone something
  bright.

Every eight bars a gust blows more seeds in.

## Design notes

Three ideas hold the whole thing up:

1. **Movement is silent.** Sound comes from contact with the ground, so the
   player composes by shaping paths, not by drawing a sequence.
2. **The tap is always a musical act.** A stomp is a stomp whether or not a seed
   is involved — planting is a consequence of playing, never a mode you switch
   into.
3. **The ground decides.** Terrain determines both the drum you hit and the
   flower you grow, so carrying a seed somewhere is a musical decision.

Bug periods (1, 2 and 3 beats) produce polyrhythm without anyone writing one.
Drums are given; melody is the thing you earn by landing hits.

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
js/audio.js     synthesised foley: leaves, water, wood, stone, flowers, wind
js/game.js      field state, bug movement, stomp resolution
js/render.js    canvas drawing
js/main.js      clocks, input, the loop
```
