// Solver / fairness simulation. Usage: node tests/sim.js [levels=60]
const G = require('../game.js');
const N = +(process.argv[2] || 60);
let fail = 0; const rows = []; const t0 = Date.now(); let worst = 0;
const total = (S) => S.barns.reduce((a, B) => a + B.cells.length + B.queue.length, 0) + S.track.length;
for (let L = 1; L <= N; L++) {
  const t = Date.now(); const lv = G.generateLevel(L); const dt = Date.now() - t; worst = Math.max(worst, dt);
  // 1) the solver found a win with no power-ups (generation refuses levels it can't solve)
  if (!lv.solution || !lv.solution.length) { fail++; console.log('FAIL level', L, 'no solution'); continue; }
  // 2) the solution replayed through the real-time parade (tap, wait for it to settle) wins
  const S = G.newGame(lv);
  for (const b of lv.solution) { const r = G.tap(S, b); if (!r.ok) { fail++; console.log('FAIL level', L, 'move rejected', r.why); break; } G.settle(S); }
  if (S.status !== 'won') { fail++; console.log('FAIL level', L, 'solution did not win:', S.status); }
  // 3) frantic random tapping never breaks the rules
  const rnd = G.mulberry32(L); const n0 = total(G.newGame(lv));
  for (let k = 0; k < 3; k++) {
    const R = G.newGame(lv);
    for (let f = 0; f < 4000 && R.status === 'play'; f++) {
      if (rnd() < 0.08) G.tap(R, Math.floor(rnd() * R.barns.length));
      G.step(R, 1 / 30);
      if (G.trackCount(R) > R.cap) { fail++; console.log('FAIL over capacity', L); break; }
      if (R.barns.some((B) => B.cells.length > B.cap)) { fail++; console.log('FAIL barn overfull', L); break; }
    }
    if (total(R) !== n0) { fail++; console.log('FAIL animals lost/created', L); }
  }
  const p = lv.params;
  rows.push({ L, kinds: p.kinds, barns: lv.board.cells.length, presets: lv.board.preset.filter((x) => x != null).length, mystery: lv.mystery.flat().filter(Boolean).length, moves: lv.solution.length, ms: dt });
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
for (const [a, b] of [[1, 5], [6, 15], [16, 30], [31, 60], [61, 200]]) {
  const rr = rows.filter((x) => x.L >= a && x.L <= b); if (!rr.length) continue;
  console.log(`levels ${a}-${b}: colors ${avg(rr.map((x) => x.kinds)).toFixed(1)}, barns ${avg(rr.map((x) => x.barns)).toFixed(1)}, preset barns ${avg(rr.map((x) => x.presets)).toFixed(1)}, mystery ${avg(rr.map((x) => x.mystery)).toFixed(1)}, solution taps ${avg(rr.map((x) => x.moves)).toFixed(0)}, gen ${avg(rr.map((x) => x.ms)).toFixed(0)} ms`);
}
console.log(`${rows.length} levels generated in ${Date.now() - t0} ms (slowest ${worst} ms); ${fail} failures`);
process.exit(fail ? 1 : 0);
