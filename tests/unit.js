// Rule tests for the loop/barn rules. Usage: node tests/unit.js
const G = require('../game.js');
const C = G.CONFIG;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// cells listed back -> front (last item is at the open end)
function mk(cells, opts) {
  opts = opts || {};
  const board = { cells, cap: cells.map(() => 16), preset: opts.preset || cells.map(() => null) };
  return { n: 1, board, mystery: opts.mystery || cells.map((c) => c.map(() => false)), layout: G.makeLayout(cells.length) };
}
const kinds = (B) => B.cells.map((a) => a.k);
const fill = (k, n) => new Array(n).fill(k);

// 1. the whole matching group at the front leaves together and parks next to a match
{
  const S = G.newGame(mk([[1, 3, 3, 3, 3], [2, 3], [5]]));
  const r = G.tap(S, 0);
  ok(r.ok && r.n === 4 && r.k === 3 && G.trackCount(S) === 4, 'a group of 4 ducks leaves together');
  G.settle(S);
  ok(kinds(S.barns[1]).join() === '2,3,3,3,3,3' && S.track.length === 0, 'they park next to the matching front animal');
}
// 2. empty barns take anyone; color-locked barns take only their animal; no match = keep parading
{
  const S = G.newGame(mk([[1, 4, 4], [], [2]], { preset: [null, null, null] }));
  G.tap(S, 0); G.settle(S);
  ok(kinds(S.barns[1]).join() === '4,4', 'an empty barn takes any animal');
  const P = G.newGame(mk([[1, 4, 4], [], [7, 7]], { preset: [null, 7, null] }));
  G.tap(P, 0); G.settle(P);
  ok(P.barns[1].cells.length === 0 && P.track.length === 2, 'a pig-only barn refuses other animals (they keep parading)');
  G.tap(P, 2); G.settle(P);
  ok(kinds(P.barns[1]).join() === '7,7', 'a color-locked barn takes its own animal');
}
// 3. track room splits a group
{
  const S = G.newGame(mk([[fill(2, 16)].flat(), [1].concat(fill(3, 15)), [], []]));
  S.cap = 10;
  const r = G.tap(S, 1);
  ok(r.ok && r.n === 10 && r.split && G.trackCount(S) === 10, 'group of 15 is split to fit the track (10)');
  const r2 = G.tap(S, 1);
  ok(!r2.ok && r2.why === 'full', 'no room on the track = tap refused');
}
// 4. a barn clears with 16 of one animal; a fence goes up; tapping it again lets them out
{
  const S = G.newGame(mk([fill(6, 14), [0, 6, 6], [1]]));
  G.tap(S, 1); const ev = G.settle(S);
  ok(S.barns[0].cleared && ev.some((e) => e.type === 'clear' && e.barn === 0), 'barn clears at 16 of one kind');
  const r = G.tap(S, 0);
  ok(r.ok && !S.barns[0].cleared && r.events.some((e) => e.type === 'unclear'), 'animals can still leave a cleared barn');
}
// 5. win when every barn is cleared or empty and nobody is parading
{
  const S = G.newGame(mk([fill(6, 2), fill(6, 14), []]));
  G.tap(S, 0); G.settle(S);
  ok(S.status === 'won', 'level won when every barn is sorted');
}
// 6. lose: track at capacity and no parading animal has anywhere to park
{
  const S = G.newGame(mk([[0].concat(fill(1, 4)), [0].concat(fill(2, 4)), [0, 3, 3, 3, 3]]));
  S.cap = 8;
  G.tap(S, 0); G.settle(S); ok(S.status === 'play', 'not over while there is room');
  G.tap(S, 1); G.settle(S);
  ok(S.status === 'lost' && S.reason === 'full', 'track full with nowhere to park = game over');
  ok(G.plus2(S) && S.cap === 10 && S.status === 'play', '+2 adds track room and resumes');
  ok(G.plus2(S) && S.cap === 12, '+2 stacks');
}
// 7. mystery animals: the front pair is always shown; the rest stay hidden until they reach the front, and stay revealed after Redo
{
  const S = G.newGame(mk([[2, 2, 3, 3, 5, 5, 6, 6], [], [1]], { mystery: [[true, true, true, true, true, true, true, true], [], [false]] }));
  const c = S.barns[0].cells;
  ok(!c[7].mystery && !c[6].mystery && c[5].mystery && c[0].mystery, 'front pair is revealed at the start, the rest hidden');
  G.tap(S, 0);
  ok(!S.barns[0].cells[5].mystery && !S.barns[0].cells[4].mystery && S.barns[0].cells[3].mystery, 'next pair is revealed as soon as it becomes the front');
  const ids = S.barns[0].cells.slice(4).map((a) => a.id);
  G.settle(S); G.tap(S, 0); G.settle(S);
  ok(G.redo(S), 'redo works');
  const back = S.barns[0].cells.filter((a) => ids.includes(a.id));
  ok(back.length === 2 && back.every((a) => !a.mystery), 'redo puts them back and they stay revealed');
  ok(S.barns.every((B) => { const n = B.cells.length; return !n || !B.cells[n - 1].mystery; }), 'no hidden animal at any front after redo');
}
// 8. parking priority: a matching barn beats an empty barn even when the empty one comes first
{
  const S = G.newGame(mk([[1, 4, 4], [], [0, 4]]));
  G.tap(S, 0); G.settle(S);
  ok(S.barns[1].cells.length === 0 && kinds(S.barns[2]).join() === '0,4,4,4', 'animals skip an empty barn when their own kind has a barn');
  const T = G.newGame(mk([[1, 4, 4], [], [0, 3]]));
  G.tap(T, 0); G.settle(T);
  ok(kinds(T.barns[1]).join() === '4,4', 'no matching barn: they use the empty one');
}
// 8b. a designated animal only ever parks in its designated barn
{
  const S = G.newGame(mk([[1, 5, 5], [], [5, 2, 2]], { preset: [null, null, 5] }));
  G.tap(S, 0); G.settle(S);
  ok(S.barns[1].cells.length === 0 && S.track.length === 2, 'frogs with a frog barn never take an empty barn (they keep parading)');
  const B = G.addTempBarn(S); G.settle(S);
  ok(B.cells.length === 0 && S.track.length === 2, 'designated animals do not use the extra barn either');
  G.tap(S, 2); G.settle(S);
  ok(kinds(S.barns[2]).join() === '5,5,5' && S.track.length === 0 && (kinds(S.barns[1]).join() === '2,2' || kinds(B).join() === '2,2'), 'once their barn shows a frog again, they go home; others use the empty barn');
}
// 9. magnet removes every animal of one color
{
  const S = G.newGame(mk([[1, 2, 1], [2, 1, 2], []]));
  const res = G.magnet(S, () => 0);
  const left = [].concat(...S.barns.map(kinds));
  ok(res && left.every((k) => k !== res.k) && left.length === 3, 'magnet takes all animals of one color');
}
// 10. extra barn holds 4 and accepts like an empty barn
{
  const S = G.newGame(mk([[1, 9, 9, 9, 9, 9, 9], [2]]));
  const B = G.addTempBarn(S);
  ok(B && B.cap === 4 && S.barns.length === 3, 'extra barn of 4 added');
  G.tap(S, 0); G.settle(S);
  ok(B.cells.length === 4 && S.track.length === 2, 'extra barn fills to 4, the rest keep parading');
}
// 11. Wild power-up: the front pair turns rainbow, keeps its color and stays put
{
  const WO = G.WOFF;
  const wild = (B) => B.cells.map((a) => (a.wild ? 'W' : '') + a.k).join();
  // any color (without a home of its own) may park in front of the rainbow pair; that color then sets the barn
  let S = G.newGame(mk([[1, 1, 2, 2], [0, 4, 4], [7]]));
  ok(G.makeWild(S, 0) && wild(S.barns[0]) === '1,1,W2,W2', 'wild pair keeps its animals and color, just rainbow');
  G.tap(S, 1); G.settle(S);
  ok(wild(S.barns[0]) === '1,1,W2,W2,4,4' && S.track.length === 0, 'a different color parks in front of the rainbow pair');
  ok(!G.barnCanPark(S.barns[0], 7, S) && G.barnCanPark(S.barns[0], 4, S), 'after that, only the new color may park there');
  ok(S.barns[0].cells[3].wild && !S.barns[0].cells[3].open, 'the rainbow stays, but its open-to-anyone power is used up');
  // the pair still has to go home: once the front leaves, the rainbow pair exits as its own color and goes to its barn
  S = G.newGame(mk([[1, 1, 2, 2], [0, 4, 4], [5, 2, 2], [6]]));
  G.makeWild(S, 0); G.tap(S, 1); G.settle(S);   // 4s park in front of the wild 2s (no 4 barn exists)
  ok(wild(S.barns[0]) === '1,1,W2,W2,4,4', 'setup: 4s in front of rainbow 2s');
  G.tap(S, 0); G.settle(S);                       // 4s leave (and keep parading: no 4 barn); rainbow pair is the front again
  ok(S.track.length === 2 && S.barns[0].cells.length === 4, 'the 4s do not come back to the used-up rainbow pair');
  ok(S.barns[0].cells[3].wild && S.barns[0].cells[3].k === 2, 'rainbow pair is the front again, still its own color');
  const r = G.tap(S, 0);
  ok(r.ok && r.k === 2 && r.n === 2, 'rainbow pair exits as its original color');
  G.settle(S);
  ok(kinds(S.barns[2]).join() === '5,2,2,2,2' && S.barns[2].cells.every((a) => !a.wild), 'it goes home to its own color and is a normal animal again');
  // a real matching barn still comes first, and the rainbow beats an empty barn
  S = G.newGame(mk([[1, 1, 2, 2], [0, 4, 4], [3, 4]]));
  G.makeWild(S, 0); G.tap(S, 1); G.settle(S);
  ok(kinds(S.barns[2]).join() === '3,4,4,4' && S.barns[0].cells.length === 4, 'matching barn beats the rainbow pair');
  S = G.newGame(mk([[0, 4, 4], [], [1, 2, 2]]));
  G.makeWild(S, 2); G.tap(S, 0); G.settle(S);
  ok(S.barns[1].cells.length === 0 && kinds(S.barns[2]).join() === '1,2,2,4,4', 'rainbow pair beats an empty barn');
  // targets: never color-locked, extra (+4) or already-wild barns; color-locked animals ignore rainbow pairs
  S = G.newGame(mk([[1, 5, 5], [2, 2, 3, 3], [4, 4]], { preset: [null, null, 5] }));
  ok(G.wildTarget(S, 2) === 'designated' && !G.makeWild(S, 2), 'wild cannot target a color-locked barn');
  const T = G.addTempBarn(S); ok(G.wildTarget(S, T.id) === 'temp', 'wild cannot target an extra barn');
  G.makeWild(S, 1); ok(G.wildTarget(S, 1) === 'already', 'already-wild pair refused');
  G.tap(S, 0); G.settle(S);
  ok(S.track.length === 2 && S.barns[1].cells.length === 4, 'color-locked animals ignore rainbow pairs');
  // tapped out before anything parks: exits as its own color and the wild is used up
  S = G.newGame(mk([[3, 3, 3, 5, 5], [], [1]]));
  G.makeWild(S, 0); const r2 = G.tap(S, 0);
  ok(r2.ok && r2.n === 2 && r2.k === 5 && S.barns[0].queue.every((a) => a.k === 5 && !a.wild), 'tapped out early: leaves as its own color, wild used up');
  // clearing is strictly 16 of one original color
  S = G.newGame(mk([[].concat(fill(6, 12), [2, 2]), [0, 6, 6], [2, 2]]));
  G.makeWild(S, 0); G.tap(S, 1); G.settle(S);
  ok(S.barns[0].cells.length === 16 && !S.barns[0].cleared, 'a barn with a rainbow pair of another color is not cleared');
  // redo undoes it
  S = G.newGame(mk([[1, 1, 2, 2], [3]]));
  G.makeWild(S, 0);
  ok(G.redo(S) && S.barns[0].cells.every((a) => !a.wild), 'redo undoes a wild');
  // compact solver rules agree
  const bd = { cells: [[1, 1, 2 + WO, 2 + WO], [0, 4, 4], []], cap: [16, 16, 16], preset: [null, null, null] };
  ok(G.canPark(bd, 0, 5) && !G.canPark(bd, 2, 5) && !G.canPark(bd, 0, 4) && G.canPark(bd, 0, 2), 'solver: home beats rainbow beats empty; own color still fits');
  const st = G.tapBoard({ cells: [[1, 1, 2 + WO, 2 + WO], [0, 5, 5], []], cap: [16, 16, 16], preset: [null, null, null] }, {}, 1);
  ok(st && st.board.cells[0].join() === '1,1,2,2,5,5', 'solver: parks in front of the rainbow pair (which keeps its color; its open power used up)');
  const st2 = G.tapBoard({ cells: [[3, 3, 5 + WO, 5 + WO], [], [5]], cap: [16, 16, 16], preset: [null, null, null] }, {}, 0);
  ok(st2 && st2.board.cells[2].join() === '5,5,5', 'solver: rainbow pair leaves as its own color and goes home');
  ok(G.topRun([4, 2 + WO, 2 + WO, 2]).run === 3 && G.isCleared(fill(6, 14).concat([6 + WO, 6 + WO]), 16), 'solver: rainbow animals count as their own color');
  const fromLive = (() => { const S2 = G.newGame(mk([[1, 1, 2, 2], [0, 4, 4], [2]])); G.makeWild(S2, 0); const b0 = G.boardOf(S2); G.tap(S2, 1); G.settle(S2); const sb = G.tapBoard(b0, {}, 1); return JSON.stringify(sb.board.cells) === JSON.stringify(G.boardOf(S2).cells); })();
  ok(fromLive, 'solver and live parade agree with a rainbow pair');
}
// 12. compact rules (solver) match the real-time parade
{
  const r = G.mulberry32(11); let agree = 0, tried = 0;
  for (let t = 0; t < 40; t++) {
    const cells = []; for (let b = 0; b < 6; b++) { const n = Math.floor(r() * 9); const c = []; for (let i = 0; i < n; i++) c.push(Math.floor(r() * 4)); cells.push(c); }
    const lv = mk(cells); const S = G.newGame(lv);
    for (let m = 0; m < 6; m++) {
      const b = Math.floor(r() * 6); const st = G.tapBoard(G.boardOf(S), {}, b);
      if (!st || Object.keys(st.circ).length || S.track.length) break;
      G.tap(S, b); G.settle(S); tried++;
      if (JSON.stringify(G.boardOf(S).cells) === JSON.stringify(st.board.cells)) agree++;
    }
  }
  ok(tried > 20 && agree === tried, 'solver rules agree with the live parade (' + agree + '/' + tried + ')');
}
// 13. generated levels: deterministic, 8+ colors, whole barns of 16, rewards
{
  const a = G.genAttempt(7, 0), b = G.genAttempt(7, 0);
  ok(JSON.stringify(a && a.board) === JSON.stringify(b && b.board), 'same seed, same level');
  for (const L of [1, 6, 15, 30]) {
    const lv = G.generateLevel(L); const cnt = {};
    for (const c of lv.board.cells) for (const k of c) cnt[k] = (cnt[k] || 0) + 1;
    ok(Object.keys(cnt).length >= 8 && Object.values(cnt).every((v) => v === 16), 'level ' + L + ': ' + Object.keys(cnt).length + ' colors, 16 each');
  }
  ok(!JSON.stringify(G.CONFIG.START_BANK).includes('shuffle') && G.CONFIG.START_BANK.wild >= 1 && G.rewardFor(1).redo === 1 && G.rewardFor(5).magnet >= 1 && G.rewardFor(5).barn >= 1, 'rewards rotate, bundle every 5');
  ok(G.starsFor({ used: 0 }) === 3 && G.starsFor({ used: 2 }) === 2 && G.starsFor({ used: 3 }) === 1, 'stars by power-ups used');
}
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
