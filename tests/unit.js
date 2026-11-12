// Rule tests. Usage: node tests/unit.js
const G = require('../game.js');
const C = G.CONFIG;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// Build a level by hand: crates are arrays of kind ids (top to bottom); options per crate.
function mk(crates, opts) {
  opts = opts || {};
  return { n: 1, crates: crates.map((ks, i) => ({ pairs: ks.map((k, j) => ({ k, hidden: !!(opts.hidden && opts.hidden[i] && opts.hidden[i].includes(j)) })), glass: opts.glass && opts.glass[i] ? opts.glass[i] : null })) };
}

// 1. tapping an end pair puts 2 animals on the path; interior pairs are not tappable
{
  const S = G.newGame(mk([[0, 1, 2]]));
  ok(G.isExposed(S.crates[0], 0) && G.isExposed(S.crates[0], 2) && !G.isExposed(S.crates[0], 1), 'both ends exposed, middle covered');
  const ev = G.tap(S, 0, 0);
  ok(ev && S.path.length === 2 && S.path.every((a) => a.k === 0), 'tap adds a pair to the path');
  ok(G.isExposed(S.crates[0], 1), 'pair behind becomes exposed');
  ok(G.tap(S, 0, 0) === null, 'tapping a gone pair does nothing');
}
// 2. 8 of the front kind clear
{
  const S = G.newGame(mk([[0, 0], [0, 0], [1]]));
  G.tap(S, 0, 0); G.tap(S, 0, 1); G.tap(S, 1, 0);
  ok(S.path.length === 6, '6 on path before set completes');
  const ev = G.tap(S, 1, 1);
  ok(ev.some((e) => e.type === 'clear' && e.ids.length === C.SET_SIZE) && S.path.length === 0, '4 pairs = 8 clear');
}
// 3. front blocks: a complete set behind a different front does NOT clear (front-only rule)
{
  const S = G.newGame(mk([[1], [0, 0], [0, 0], [1, 1, 1]]));
  G.tap(S, 0, 0); // pink-blocker at front
  G.tap(S, 1, 0); G.tap(S, 1, 1); G.tap(S, 2, 0); G.tap(S, 2, 1);
  ok(S.path.length === 10 && S.path[0].k === 1, 'set of 8 behind a blocked front waits (front-only)');
  // now 3 more pairs of kind 1 -> front kind reaches 8 and clears, then the 0s clear too
  G.tap(S, 3, 0);
  ok(S.status === 'lost' && S.reason === 'full', 'path full at 12 with blocked front = lose');
}
// 4. clearing the front cascades to the next set
{
  const S = G.newGame(mk([[1, 1], [0, 0], [0, 0], [1, 1]]));
  G.tap(S, 0, 0); G.tap(S, 1, 0); G.tap(S, 1, 1); G.tap(S, 2, 0); G.tap(S, 2, 1); // front 1 (2), 0 x8 behind
  ok(S.path.length === 10, '10 waiting');
  G.tap(S, 0, 1); // 4 of kind1 on path... not 8 yet
  ok(S.status === 'lost', 'full again (front kind 1 only has 4)');
}
{
  const S = G.newGame(mk([[1, 1], [1, 1], [0, 0], [0, 0]]));
  G.tap(S, 0, 0); G.tap(S, 2, 0); G.tap(S, 2, 1); G.tap(S, 3, 0); // front 1, then 6 of kind 0
  G.tap(S, 0, 1); G.tap(S, 1, 0); // kind1: 6 on path... path = 1,1,0x6,1,1,1,1 = 12 -> lose? check before
  ok(S.status === 'lost', 'still full: 12 animals, front kind 1 has 6');
}
{
  const S = G.newGame(mk([[1, 1, 1, 1], [0, 0, 0, 0]]));
  G.tap(S, 0, 0); G.tap(S, 1, 0); G.tap(S, 1, 3); // 1,1, 0 x4
  G.tap(S, 0, 3); G.tap(S, 0, 1); // kind 1 -> 6, path 10
  G.tap(S, 0, 2); // kind 1 -> 8 at 12 animals: it clears before the full check
  ok(S.path.length === 4 && S.path[0].k === 0 && S.status === 'play', 'front set clears and line closes up (even at 12/12)');
  G.tap(S, 1, 1);
  const ev = G.tap(S, 1, 2);
  ok(ev.some((e) => e.type === 'clear') && S.status === 'won', 'last set clears, level won');
}
// 5. glass crate: front animal of target kind flies in, counter drops, shatters at 0 and unlocks
{
  const S = G.newGame(mk([[2, 2], [0, 0, 0, 0], [0]], { glass: { 2: { kind: 2, need: 4 } } }));
  ok(!G.isExposed(S.crates[2], 0), 'glass crate contents locked');
  G.tap(S, 0, 0);
  ok(S.path.length === 0 && S.crates[2].glass.need === 2, 'target animals fly into the glass');
  const ev = G.tap(S, 0, 1);
  ok(ev.some((e) => e.type === 'shatter') && !S.crates[2].glass && G.isExposed(S.crates[2], 0), 'glass shatters at 0 and frees the pair');
}
// 6. ? tiles flip when the covering pair leaves
{
  const S = G.newGame(mk([[0, 1, 2, 0]], { hidden: { 0: [1, 2] } }));
  ok(S.crates[0].pairs[1].hidden && S.crates[0].pairs[2].hidden, 'inner pairs hidden');
  const ev = G.tap(S, 0, 0);
  ok(!S.crates[0].pairs[1].hidden && ev.some((e) => e.type === 'reveal'), 'hidden pair flips when uncovered');
  ok(S.crates[0].pairs[2].hidden, 'still-covered pair stays hidden');
}
// 7. power-ups
{
  const S = G.newGame(mk([[1], [0, 0], [0, 0], [1, 1, 1]]));
  G.tap(S, 0, 0); G.tap(S, 1, 0); G.tap(S, 1, 1); G.tap(S, 2, 0); G.tap(S, 2, 1); G.tap(S, 3, 0);
  ok(S.status === 'lost', 'setup: lost');
  ok(G.undo(S) && S.status === 'play' && S.path.length === 10, 'undo restores previous state');
  G.tap(S, 3, 0);
  ok(G.plus2(S) && S.cap === 14 && S.status === 'play', '+2 adds space and resumes');
  ok(G.plus2(S) && !G.plus2(S), '+2 limited per level');
}
{
  const S = G.newGame(mk([[1], [0, 0], [1, 1, 1]]));
  G.tap(S, 0, 0); G.tap(S, 1, 0); // front 1 (2), 0 (2)
  const ev = G.magnet(S);
  ok(ev && ev.some((e) => e.type === 'magnet' && e.clearIds.length === 8), 'magnet completes the front set');
  ok(S.path.length === 2 && S.path[0].k === 0, 'magnet leaves the rest of the line');
  ok(S.crates[2].pairs.every((p) => p.gone), 'magnet pulled pairs from the board (even covered ones)');
}
{
  const S = G.newGame(mk([[1, 2], [3]], { hidden: {} }));
  ok(G.swap(S, { c: 0, i: 0 }, { c: 1, i: 0 }) && S.crates[0].pairs[0].k === 3 && S.crates[1].pairs[0].k === 1, 'swap exchanges two pairs');
  const H = G.newGame(mk([[1, 2, 3]], { hidden: { 0: [1] } }));
  ok(!G.swap(H, { c: 0, i: 0 }, { c: 0, i: 1 }), 'cannot swap a hidden pair');
}
// 8. rewards and stars
{
  ok(G.rewardFor(1).undo === 1 && G.rewardFor(2).swap === 1, 'rotating reward');
  const r5 = G.rewardFor(5); ok(r5.undo === 2 && r5.swap === 1 && r5.plus2 === 1 && r5.magnet === 1, 'bundle every 5 levels');
  ok(G.starsFor({ used: 0 }) === 3 && G.starsFor({ used: 1 }) === 2 && G.starsFor({ used: 5 }) === 1, 'stars by power-ups used');
}
// 9. generated levels are deterministic and every animal count works out
{
  const a = G.genAttempt(12, 0), b = G.genAttempt(12, 0);
  ok(JSON.stringify(a && a.crates) === JSON.stringify(b && b.crates), 'same seed, same level');
  for (const L of [1, 5, 9, 17, 33]) {
    const lv = G.generateLevel(L); const cnt = {};
    for (const c of lv.crates) for (const p of c.pairs) cnt[p.k] = (cnt[p.k] || 0) + 2;
    for (const c of lv.crates) if (c.glass) cnt[c.glass.kind] -= c.glass.need;
    ok(Object.values(cnt).every((v) => v > 0 && v % C.SET_SIZE === 0), 'level ' + L + ' animal counts are whole sets');
  }
}
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
