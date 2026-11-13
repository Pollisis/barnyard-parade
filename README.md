# Barnyard Parade

A cozy barn-sorting puzzle for the phone browser. Original art and code, no ads, no store, no lives.

Play: https://pollisis.github.io/barnyard-parade/

## How to play
- **Tap a barn** (anywhere on it) to send its front animals out. A same-color group leaves together; if the parade doesn't have room, only as many as fit go.
- Animals **parade around the loop** and park by themselves next to a matching animal. They only take an empty barn when their kind has no barn with room (even if they pass the empty one first).
- **Color-locked barns** (colored floor, thick rim, big badge) take only their animal, and that animal parks *only* there: never in an empty barn, another stack, or the extra barn. If its barn is blocked or full, it keeps parading.
- Fill a barn with **16 of one animal** (8 rows of pairs): chime, and a little fence closes it. You can still tap a fenced barn to let them out again.
- The sign in the middle shows how many are parading (x/16). If it is full and nobody can park, it's game over (Retry, or use a power-up).
- **?** boxes are a surprise until they reach the front of their barn: the front pair is always shown. Once seen, they stay seen (also after Redo).
- When everything left has a home, the last animals hurry home.

## Power-ups (free, earned by clearing levels, saved on the device)
Each asks first (name, what it does, how many you have). Redo (put the last group back), Shuffle (re-deal the colors in unsorted barns), +2 Track (stacks), Magnet (removes every animal of one random color), Extra barn (holds 4; color-locked animals can't use it).

## Levels
Levels are generated from a seed (same level every time), get a little harder and then plateau (8 colors at level 1, 10 by level 17; ? boxes from level 3; 2 color-locked barns from level 5, 3 from level 15). Every level is checked by a solver and only shown if it can be won **without power-ups**, assuming you let the parade settle between taps; the found solution is also replayed through the real-time parade before the level is shown.

## Files
`index.html`, `style.css`, `config.js` (tuning), `game.js` (rules, generator, solver; also runs in Node), `art.js`, `audio.js` (synthesized sounds and music), `main.js` (rendering, input, dialogs), `assets/` (generated sprites and textures).

## Tests
- `node tests/unit.js` rules
- `node tests/sim.js 60` generates levels, replays each solution through the real-time parade, random-tap invariants
- `PW_PATH=/path/to/playwright node tests/e2e.js http://127.0.0.1:8817/ screenshots` browser test
