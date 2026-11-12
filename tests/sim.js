// Solver / fairness simulation. Usage: node tests/sim.js [levels=100]
const G = require('../game.js');
const N = +(process.argv[2] || 100);
let fail = 0; const rows = [];
const t0 = Date.now(); let worst = 0;
for (let L = 1; L <= N; L++) {
  const t = Date.now();
  const lv = G.generateLevel(L);
  const dt = Date.now() - t; worst = Math.max(worst, dt);
  // 1) the full-information solver finds a no-power-up win
  const s = G.solve(lv);
  if (!s.ok) { fail++; console.log('FAIL level', L, 'not solvable'); continue; }
  // 2) replaying that solution through the real game rules wins
  const S = G.newGame(lv);
  for (const m of s.solution) { const c = S.crates[m.c]; const i = m.end === 0 ? G.firstLive(c) : G.lastLive(c); if (!G.tap(S, m.c, i)) { fail++; console.log('FAIL level', L, 'solution move rejected'); break; } }
  if (S.status !== 'won') { fail++; console.log('FAIL level', L, 'solution did not win:', S.status); }
  // 3) random play never breaks invariants
  const r = G.mulberry32(L);
  for (let k = 0; k < 5; k++) {
    const R = G.newGame(lv);
    while (R.status === 'play') { const mv = G.moves(R).filter((m) => G.canTap(R, m.c, m.i)); if (!mv.length) break; const m = mv[Math.floor(r() * mv.length)]; G.tap(R, m.c, m.i); if (R.path.length > R.cap) { fail++; console.log('FAIL path over capacity', L); break; } }
  }
  rows.push({ L, pairs: lv.intended.length, kinds: lv.params.kinds, glass: lv.crates.filter((c) => c.glass).length, hidden: lv.crates.reduce((a, c) => a + c.pairs.filter((p) => p.hidden).length, 0), bot: lv.botRate, ms: dt });
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
for (const [a, b] of [[1, 10], [11, 20], [21, 30], [31, 50], [51, 100]]) {
  const rr = rows.filter((x) => x.L >= a && x.L <= b); if (!rr.length) continue;
  console.log(`levels ${a}-${b}: pairs ${avg(rr.map((x) => x.pairs)).toFixed(1)}, kinds ${avg(rr.map((x) => x.kinds)).toFixed(1)}, glass ${avg(rr.map((x) => x.glass)).toFixed(2)}, hidden ${avg(rr.map((x) => x.hidden)).toFixed(1)}, blind-bot win ${(avg(rr.map((x) => x.bot)) * 100).toFixed(0)}%, gen ${avg(rr.map((x) => x.ms)).toFixed(0)} ms`);
}
console.log(`${rows.length} levels generated in ${Date.now() - t0} ms (slowest ${worst} ms); ${fail} failures`);
process.exit(fail ? 1 : 0);
