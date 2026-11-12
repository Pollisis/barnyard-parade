# Barnyard Parade

A cozy color-sort puzzle with cute farm animals. Static HTML/JS on a canvas, no build step, made for phones and iPads (touch) and works on desktop.
Play at https://pollisis.github.io/barnyard-parade/

The name lives in one place: `GAME_NAME` in `config.js`.

## How to play
- Wooden crates hold animals in side-by-side pairs. The pair at **either end** of a crate can be tapped; it hops onto the dirt path and joins the line.
- Only the **front** of the line (by the HOME hole) is checked:
  1. if a glass crate wants that animal, it flies in and the glass counter goes down; at 0 the glass shatters and its pairs become playable;
  2. otherwise, if 8 of the front animal's kind are on the path, all 8 go home ("Great!!") and the line closes up;
  3. otherwise the front waits and blocks the line.
- The path holds 12 (shown on the sign). If it is full and the front is blocked: "Path full!" (Retry, or use a saved power-up).
- `?` tiles flip over as soon as the pair next to them leaves (when they become the end of their crate).
- Clear every animal to win. Stars: 3 with no power-ups, 2 with 1-2, 1 otherwise.

## Power-ups (free, no store, no ads, no lives)
Undo, Swap (swap two visible pairs), +2 path space (this level, up to twice), Magnet (pulls the front animal's kind from the board to finish its set).
You start with 2 Undo + 1 of each other. The first time you clear a level you get +1 of a rotating type, and every 5th level +1 of each. Unused power-ups bank in localStorage and carry over.

## Fair levels
Levels are generated from a seed (the level number), so level N is the same every time.
The generator first builds a valid play order, then packs it into crates, so a no-power-up win always exists. Before a level is shown:
1. a full-information solver must find a win with no power-ups (`solve`), and
2. a "blind" bot that only sees what the player sees must win at least a set share of its runs (60% early, easing to 20% at the plateau), otherwise the level is regenerated.
Difficulty ramps gently (more kinds, sets, `?` tiles and glass crates) and plateaus around level 25-30. All knobs are at the top of `config.js`.

## Files
- `config.js`: name, version, ~35 tuning knobs
- `game.js`: rules, level generator, solver, bot (pure JS, runs in Node too)
- `art.js`: original canvas-drawn animals (pig, chick, sheep, frog, duck, cow, bunny, hen, black sheep, goat), cached as sprites
- `audio.js`: WebAudio-synthesized animal noises, effects and a looping tune (no recordings)
- `main.js`: rendering, animation, input, HUD, dialogs, level map, save data
- `tests/unit.js` rules, `tests/sim.js` solver/fairness sim, `tests/e2e.js` Playwright smoke test (screenshots)

## Tests
```
node tests/unit.js
node tests/sim.js 100
python3 -m http.server 8817 & PW_PATH=/path/to/playwright CHROME=/usr/bin/google-chrome node tests/e2e.js http://127.0.0.1:8817/ screenshots
```
Asset URLs carry `?v=N` for cache busting; bump it in `index.html` with each release.
