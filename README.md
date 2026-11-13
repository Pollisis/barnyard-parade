# Barnyard Parade

A cozy barn-sorting puzzle for the phone browser. Original art and code, no ads, no store, no lives.

Play: https://pollisis.github.io/barnyard-parade/

## How to play
- **Tap a barn** (anywhere on it) to send its front animals out. A same-color group leaves together; if the parade doesn't have room, only as many as fit go.
- Animals **parade around the loop** and park by themselves next to a matching animal, or in an empty barn. A barn with a colored rim and badge only takes that animal.
- Fill a barn with **16 of one animal** (8 rows of pairs): chime, and a little fence closes it. You can still tap a fenced barn to let them out again.
- The sign in the middle shows how many are parading (x/16). If it is full and nobody can park, it's game over (Retry, or use a power-up).
- **?** boxes are a surprise until they leave their barn (or a match parks next to them). Once seen, they stay seen.
- When everything left has a home, the last animals hurry home.

## Power-ups (free, earned by clearing levels, saved on the device)
Redo (put the last group back), Shuffle (re-deal the colors in unsorted barns), +2 Track (stacks), Magnet (removes every animal of one random color), Extra barn (holds 4).

## Levels
Levels are generated from a seed (same level every time), get a little harder and then plateau (8 colors at level 1, 10 by level 17; ? boxes from level 3; color-locked barns from level 5). Every level is checked by a solver and only shown if it can be won **without power-ups**, assuming you let the parade settle between taps.

## Files
`index.html`, `style.css`, `config.js` (tuning), `game.js` (rules, generator, solver; also runs in Node), `art.js`, `audio.js` (synthesized sounds and music), `main.js` (rendering, input, dialogs), `assets/` (generated sprites and textures).

## Tests
- `node tests/unit.js` rules
- `node tests/sim.js 60` generates levels, replays each solution through the real-time parade, random-tap invariants
- `PW_PATH=/path/to/playwright node tests/e2e.js http://127.0.0.1:8817/ screenshots` browser test
