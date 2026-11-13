// Barnyard Parade v2: pure game logic (loop track, barns, parking, level generator, solver). Browser + Node.
(function (root, factory) {
  const cfg = (typeof module === 'object' && module.exports) ? require('./config.js') : root.BP_CONFIG;
  const api = factory(cfg);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BPGame = api;
})(this, function (CFGROOT) {
  'use strict';
  const C = CFGROOT.CONFIG;
  const KINDS = ['pig', 'chick', 'sheep', 'frog', 'duck', 'cow', 'bunny', 'hen', 'blacksheep', 'goat'];
  const CAP = C.BARN_CAP;
  let SW = [6, 4, 0.6, 0.25, 0.8, 0];
  function setSolverWeights(w) { SW = w; }

  // ---------- helpers ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seedFor = (level, attempt) => (Math.imul(level, 2654435761) ^ Math.imul(attempt + 7, 40503) ^ 0x5bd1e995) >>> 0;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  function shuffle(r, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const mod = (a, n) => ((a % n) + n) % n;

  function levelParams(level) {
    const t = (from, to) => clamp01((level - from) / Math.max(1, to - from));
    return {
      kinds: Math.min(C.KINDS_MAX, KINDS.length, C.KINDS_START + Math.floor((level - 1) / C.KINDS_EVERY)),
      empty: level < C.EMPTY_DROP_LEVEL ? C.EMPTY_START : C.EMPTY_END,
      merge: lerp(C.MERGE_START, C.MERGE_END, t(1, C.MERGE_RAMP)),
      mystery: level < C.MYSTERY_FROM ? 0 : lerp(C.MYSTERY_START, C.MYSTERY_MAX, t(C.MYSTERY_FROM, C.MYSTERY_RAMP)),
      presets: level < C.PRESET_FROM ? 0 : Math.min(C.PRESET_MAX, 1 + Math.floor((level - C.PRESET_FROM) / C.PRESET_EVERY)),
    };
  }

  // ---------- board geometry (units = one animal cell) ----------
  // Barns stand above and below a rounded rectangular loop. Top barns open downward onto the top lane,
  // bottom barns open upward onto the bottom lane. Extra (power-up) barns sit inside the loop.
  const BARN_W = 2.3, BARN_H = CAP / 2 + 0.35, STEP = 2.45, LANE = 1.1, MID = 2.9, RC = 0.9;
  function makeLayout(nBarns) {
    const nt = Math.ceil(nBarns / 2), nb = nBarns - nt;
    const per = Math.max(nt, nb);
    const W = per * STEP + 0.6;
    const top0 = 0.3, yT = top0 + BARN_H + LANE / 2, yB = yT + LANE + MID, H = yB + LANE / 2 + BARN_H + 0.3;
    const xl = 0.55, xr = W - 0.55;
    // loop polyline, clockwise: top lane left->right, right side down, bottom lane right->left, left side up
    const pts = [];
    const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8; pts.push({ x: cx + Math.cos(a) * RC, y: cy + Math.sin(a) * RC }); } };
    pts.push({ x: xl + RC, y: yT });
    arc(xr - RC, yT + RC, -Math.PI / 2, 0);
    arc(xr - RC, yB - RC, 0, Math.PI / 2);
    arc(xl + RC, yB - RC, Math.PI / 2, Math.PI);
    arc(xl + RC, yT + RC, Math.PI, Math.PI * 1.5);
    const segs = []; let L = 0;
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 1e-9) continue; segs.push({ a, b, len, s0: L }); L += len; }
    const project = (x, y) => { let best = 1e9, bs = 0; for (const g of segs) { const t = Math.max(0, Math.min(1, ((x - g.a.x) * (g.b.x - g.a.x) + (y - g.a.y) * (g.b.y - g.a.y)) / (g.len * g.len))); const px = g.a.x + (g.b.x - g.a.x) * t, py = g.a.y + (g.b.y - g.a.y) * t; const d = Math.hypot(px - x, py - y); if (d < best) { best = d; bs = g.s0 + g.len * t; } } return bs; };
    const barns = [];
    const offT = (W - nt * STEP) / 2 + (STEP - BARN_W) / 2, offB = (W - nb * STEP) / 2 + (STEP - BARN_W) / 2;
    for (let i = 0; i < nt; i++) { const x = offT + i * STEP; barns.push({ x, y: top0, w: BARN_W, h: BARN_H, side: 'top', dock: project(x + BARN_W / 2, yT) }); }
    for (let i = nb - 1; i >= 0; i--) { const x = offB + i * STEP; barns.push({ x, y: yB + LANE / 2, w: BARN_W, h: BARN_H, side: 'bottom', dock: project(x + BARN_W / 2, yB) }); }
    // barns listed in loop order: top left->right, then bottom right->left
    const temps = [];
    const th = C.TEMP_BARN_CAP / 2 + 0.35;
    for (let i = 0; i < C.TEMP_BARN_MAX; i++) { const x = xl + 1.4 + i * STEP; temps.push({ x, y: yT + LANE / 2 + 0.12, w: BARN_W, h: th, side: 'bottom', dock: project(x + BARN_W / 2, yT) + 0.02 }); }
    const sign = { x: xr - 2.2, y: (yT + yB) / 2 };
    return { W, H, yT, yB, xl, xr, pts, segs, L, barns, temps, sign };
  }
  function pointAt(lay, s) {
    s = mod(s, lay.L);
    let lo = 0, hi = lay.segs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lay.segs[m].s0 <= s) lo = m; else hi = m - 1; }
    const g = lay.segs[lo]; const t = (s - g.s0) / g.len;
    return { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t, ang: Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) };
  }

  // ---------- rules on a compact board (used by generator, solver and tests) ----------
  // board = { cells: [[k,...] bottom->top], cap: [16..], preset: [k|null], n } ; barns are in loop order
  function topRun(cells) { const n = cells.length; if (!n) return { k: -1, run: 0 }; const k = cells[n - 1]; let r = 0; for (let i = n - 1; i >= 0 && cells[i] === k; i--) r++; return { k, run: r }; }
  function canPark(board, b, k) { const c = board.cells[b]; return c.length < board.cap[b] && (board.preset[b] == null || board.preset[b] === k) && (!c.length || c[c.length - 1] === k); }
  function isCleared(cells, cap) { if (cells.length !== CAP || cap !== CAP) return false; for (const x of cells) if (x !== cells[0]) return false; return true; }
  // One tap on the compact board. circ = {kind: count} of animals left circling (nowhere to park yet).
  // Only barn X changes when you tap it, so the result is the same however the parade is spaced, as long as
  // the tap does not make an empty barn wanted by two different colors (the solver skips those ambiguous taps).
  function tapBoard(board, circ, X, trackCap) {
    trackCap = trackCap || C.TRACK_CAPACITY;
    let tot = 0; for (const k in circ) tot += circ[k];
    const { k: d, run } = topRun(board.cells[X]);
    if (!run) return null;
    const n = Math.min(run, trackCap - tot);
    if (n <= 0) return null;
    const nb = { cells: board.cells.map((c) => c.slice()), cap: board.cap, preset: board.preset };
    const nc = Object.assign({}, circ);
    nb.cells[X].length -= n;
    const N = nb.cells.length;
    if (!nb.cells[X].length) {
      const want = Object.keys(nc).filter((c) => nc[c] > 0 && canPark(nb, X, +c));
      if (want.length > 1 || (want.length === 1 && +want[0] !== d && canPark(nb, X, d))) return null;
    }
    let left = n;
    for (let j = 0; j < n; j++) {
      let placed = false;
      for (let st = 1; st <= N; st++) { const t = (X + st) % N; if (canPark(nb, t, d)) { nb.cells[t].push(d); placed = true; break; } }
      if (!placed) break; left--;
    }
    if (left) nc[d] = (nc[d] || 0) + left;
    for (const c of Object.keys(nc)) { while (nc[c] > 0 && canPark(nb, X, +c)) { nb.cells[X].push(+c); nc[c]--; } if (!nc[c]) delete nc[c]; }
    return { board: nb, circ: nc };
  }
  function boardWon(board, circ) { return (!circ || !Object.keys(circ).length) && board.cells.every((c, i) => !c.length || isCleared(c, board.cap[i])); }
  const boardKey = (board, circ) => board.cells.map((c) => c.join('.')).join('|') + '#' + Object.keys(circ || {}).sort().map((k) => k + ':' + circ[k]).join(',');

  // Depth-first search with a greedy move order for a win with no power-ups.
  function solve(board, limit, trackCap) {
    limit = limit || C.SOLVER_NODE_LIMIT;
    const seen = new Set(); let nodes = 0; const path = [];
    const score = (st) => {
      let v = 0;
      const W = SW;
      st.board.cells.forEach((c, i) => { if (!c.length) { v += W[0]; return; } const { run } = topRun(c); if (run === c.length) v += W[1] + run * W[2]; else v += run * W[3]; if (isCleared(c, st.board.cap[i])) v += 20;
        // runs buried under other colors are work still to do
        let breaks = 0; for (let j = 1; j < c.length; j++) if (c[j] !== c[j - 1]) breaks++; v -= breaks * W[5]; });
      for (const k in st.circ) v -= st.circ[k] * W[4];
      return v;
    };
    function dfs(st) {
      if (boardWon(st.board, st.circ)) return true;
      if (++nodes > limit) return false;
      const key = boardKey(st.board, st.circ); if (seen.has(key)) return false; seen.add(key);
      const opts = [];
      for (let b = 0; b < st.board.cells.length; b++) {
        const c = st.board.cells[b];
        if (!c.length || isCleared(c, st.board.cap[b])) continue;
        const r = tapBoard(st.board, st.circ, b, trackCap); if (r) opts.push({ b, r, sc: score(r) });
      }
      opts.sort((x, y) => y.sc - x.sc);
      for (const o of opts) { path.push(o.b); if (dfs(o.r)) return true; path.pop(); if (nodes > limit) return false; }
      return false;
    }
    const ok = dfs({ board, circ: {} });
    return { ok, nodes, solution: ok ? path.slice() : null };
  }
  function replay(board, moves) { let st = { board, circ: {} }; for (const b of moves) { st = tapBoard(st.board, st.circ, b); if (!st) return null; } return st; }

  // ---------- level generation ----------
  // Deal shuffled pairs (sometimes merged into runs of 4-6) into the barns, leave some barns empty,
  // then keep the deal only if the solver finds a win without power-ups. Seeded by level number.
  function genAttempt(level, attempt) {
    const r = mulberry32(seedFor(level, attempt));
    const P = levelParams(level);
    const merge = Math.min(0.85, P.merge + Math.floor(attempt / 25) * 0.08); // ease off if a seed keeps failing
    const kinds = shuffle(r, KINDS.map((_, i) => i)).slice(0, P.kinds);
    const chunks = [];
    for (const k of kinds) { let left = CAP; while (left > 0) { let sz = 2; while (sz < left && sz < 8 && r() < merge) sz += 2; chunks.push({ k, sz }); left -= sz; } }
    shuffle(r, chunks);
    const flat = []; for (const c of chunks) for (let i = 0; i < c.sz; i++) flat.push(c.k);
    const cells = [];
    for (let b = 0; b < P.kinds; b++) cells.push(flat.slice(b * CAP, b * CAP + CAP));
    for (let e = 0; e < P.empty; e++) cells.push([]);
    shuffle(r, cells);
    if (cells.some((c) => isCleared(c, CAP))) return null;
    const preset = cells.map(() => null);
    const pk = shuffle(r, kinds.slice()).slice(0, P.presets);
    const slots = shuffle(r, cells.map((_, i) => i)).slice(0, pk.length);
    slots.forEach((b, i) => { preset[b] = pk[i]; });
    const board = { cells, cap: cells.map(() => CAP), preset };
    const s = solve(board, C.SOLVER_NODE_LIMIT);
    if (!s.ok) return null;
    const mystery = cells.map((c) => c.map(() => false));
    cells.forEach((c, b) => { const rows = Math.ceil(c.length / 2); for (let row = 0; row < rows - 1; row++) if (r() < P.mystery) { mystery[b][row * 2] = true; if (row * 2 + 1 < c.length) mystery[b][row * 2 + 1] = true; } });
    return { n: level, attempt, params: P, merge, kinds, board, mystery, solution: s.solution, solverNodes: s.nodes, layout: null };
  }
  const cache = {};
  function generateLevel(level) {
    if (cache[level]) return cache[level];
    for (let attempt = 0; attempt < C.GEN_MAX_TRIES; attempt++) {
      const lv = genAttempt(level, attempt);
      if (!lv) continue;
      const end = replay(lv.board, lv.solution);     // double-check the found win against the rules
      if (!end || !boardWon(end.board, end.circ)) continue;
      lv.layout = makeLayout(lv.board.cells.length);
      cache[level] = lv; return lv;
    }
    throw new Error('could not generate level ' + level);
  }

  // ---------- live game (real-time loop) ----------
  function newGame(lv) {
    let nextId = 1;
    const S = {
      level: lv.n, cap: C.TRACK_CAPACITY, status: 'play', reason: null, t: 0, used: 0, plus2: 0, zoom: false,
      track: [], history: [], revealed: {}, removed: [], moves: 0, L: lv.layout.L,
      barns: lv.board.cells.map((cells, b) => ({ id: b, temp: false, cap: lv.board.cap[b], preset: lv.board.preset[b], dock: lv.layout.barns[b].dock, cleared: false, queue: [],
        cells: cells.map((k, i) => ({ id: nextId++, k, mystery: !!lv.mystery[b][i] })) })),
      tempUsed: 0,
    };
    S.nextId = nextId;
    S.barns.forEach((B) => { B.cleared = isCleared(B.cells.map((a) => a.k), B.cap); });
    S.layoutRef = lv.layout;
    return S;
  }
  const trackCount = (S) => S.track.length + S.barns.reduce((a, B) => a + B.queue.length, 0);
  function barnCanPark(B, k) { const c = B.cells; return c.length < B.cap && (B.preset == null || B.preset === k) && (!c.length || c[c.length - 1].k === k); }
  function frontGroup(B) { const c = B.cells; if (!c.length) return { k: -1, run: 0 }; const k = c[c.length - 1].k; let r = 0; for (let i = c.length - 1; i >= 0 && c[i].k === k; i--) r++; return { k, run: r }; }
  function snapshot(S) { const { history, layoutRef, ...rest } = S; return clone(rest); }
  function pushHistory(S) { S.history.push(snapshot(S)); if (S.history.length > 60) S.history.shift(); }
  function tap(S, b) {
    const B = S.barns[b];
    if (!B || S.status !== 'play') return { ok: false, why: 'over' };
    const { k, run } = frontGroup(B);
    if (!run) return { ok: false, why: 'empty' };
    const room = S.cap - trackCount(S);
    const n = Math.min(run, room);
    if (n <= 0) return { ok: false, why: 'full' };
    pushHistory(S);
    const out = [];
    for (let j = 0; j < n; j++) { const a = B.cells.pop(); const wasMystery = a.mystery; a.mystery = false; S.revealed[a.id] = 1; B.queue.push(a); out.push({ id: a.id, wasMystery }); }
    const events = [{ type: 'exit', barn: b, k, n, split: n < run, animals: out }];
    if (B.cleared) { B.cleared = false; events.push({ type: 'unclear', barn: b }); }
    S.moves++;
    return { ok: true, n, k, split: n < run, events };
  }
  // Advance the parade by dt seconds. Returns events (enter, park, clear, reveal, won, lost).
  function step(S, dt) {
    const ev = [];
    if (S.status !== 'play') return ev;
    const L = S.L, gap = C.GAP;
    S.t += dt;
    // merge queued animals onto the track when the spot in front of their barn is clear
    for (const B of S.barns) {
      if (!B.queue.length) continue;
      let free = true;
      for (const a of S.track) { const ahead = mod(a.s - B.dock, L), behind = mod(B.dock - a.s, L); if (ahead < gap * 0.98 || behind < gap * 0.98) { free = false; break; } }
      if (!free) continue;
      const a = B.queue.shift(); a.s = mod(B.dock + 1e-4, L); a.from = B.id; S.track.push(a);
      ev.push({ type: 'enter', id: a.id, barn: B.id });
    }
    // car-following movement around the loop
    const v = C.SPEED * (S.zoom ? C.ZOOM_SPEED : 1) * dt;
    const tr = S.track; const n = tr.length;
    if (n) {
      tr.sort((a, b) => a.s - b.s);
      const old = tr.map((a) => a.s); const nw = new Array(n);
      let k0 = 0, best = -1;
      for (let i = 0; i < n; i++) { const h = n === 1 ? L : mod(old[(i + 1) % n] - old[i], L); if (h > best) { best = h; k0 = i; } }
      nw[k0] = old[k0] + (n === 1 ? v : Math.min(v, Math.max(0, best - gap) + v));
      for (let j = 1; j < n; j++) {
        const i = mod(k0 - j, n), ld = (i + 1) % n;
        let lead = nw[ld]; if (lead < old[i]) lead += L * Math.ceil((old[i] - lead) / L + 1e-9);
        while (lead - old[i] > L) lead -= L;
        nw[i] = Math.max(old[i], Math.min(old[i] + v, lead - gap));
      }
      // parking: check docks crossed this step, nearest first; animals further ahead go first
      const docks = S.barns.map((B) => ({ B, d: B.dock }));
      const idx = tr.map((_, i) => i).sort((a, b) => mod(old[k0] - old[b], L) - mod(old[k0] - old[a], L));
      const parked = new Set();
      for (const i of idx) {
        const a = tr[i], moved = nw[i] - old[i];
        a.s = mod(nw[i], L);
        if (moved <= 0) continue;
        let hit = null, hd = 1e9;
        for (const { B, d } of docks) { const dd = mod(d - old[i], L); if (dd > 0 && dd <= moved + 1e-9 && dd < hd && barnCanPark(B, a.k)) { hit = B; hd = dd; } }
        if (hit) {
          parked.add(a.id);
          const top = hit.cells[hit.cells.length - 1];
          if (top && top.mystery) { top.mystery = false; S.revealed[top.id] = 1; ev.push({ type: 'reveal', barn: hit.id, id: top.id }); }
          delete a.s; delete a.from; hit.cells.push(a);
          ev.push({ type: 'park', id: a.id, barn: hit.id, k: a.k });
          if (!hit.temp && isCleared(hit.cells.map((x) => x.k), hit.cap)) { hit.cleared = true; ev.push({ type: 'clear', barn: hit.id, k: a.k }); }
        }
      }
      if (parked.size) S.track = tr.filter((a) => !parked.has(a.id));
    }
    updateStatus(S, ev);
    return ev;
  }
  function anyParkable(S) { for (const a of S.track) for (const B of S.barns) if (barnCanPark(B, a.k)) return true; return false; }
  function updateStatus(S, ev) {
    const queued = S.barns.some((B) => B.queue.length);
    // zoom when every barn is single-colored and every parading animal has a home waiting
    S.zoom = !queued && S.track.length > 0 && S.barns.every((B) => !B.cells.length || B.cells.every((a) => a.k === B.cells[0].k)) &&
      S.track.every((a) => S.barns.some((B) => barnCanPark(B, a.k))) && S.barns.every((B) => !B.temp || !B.cells.length);
    if (!S.track.length && !queued && S.barns.every((B) => !B.cells.length || (B.temp ? false : B.cleared))) { S.status = 'won'; if (ev) ev.push({ type: 'won' }); return; }
    if (!queued && trackCount(S) >= S.cap && !anyParkable(S)) { S.status = 'lost'; S.reason = 'full'; if (ev) ev.push({ type: 'lost' }); }
  }
  // Settle: run the parade until nothing changes (all parked, or animals circling with nowhere to go)
  function settle(S, maxT) {
    const all = []; let idle = 0; const dt = 0.05; let t = 0;
    while (S.status === 'play' && t < (maxT || 120)) {
      const ev = step(S, dt); t += dt; all.push(...ev);
      const queued = S.barns.some((B) => B.queue.length);
      if (!queued && (!S.track.length || !anyParkable(S))) { idle += dt; if (idle > (S.track.length ? S.L / C.SPEED + 1 : 0)) break; } else idle = 0;
    }
    return all;
  }

  // ---------- power-ups ----------
  function redo(S) {
    if (!S.history.length) return false;
    const keep = Object.assign({}, S.revealed), h = S.history, prev = h.pop();
    const used = S.used, cap = S.cap, plus2 = S.plus2, temps = S.barns.filter((B) => B.temp).length;
    Object.assign(S, prev); S.history = h; S.revealed = keep; S.used = used + 1; S.cap = Math.max(S.cap, cap); S.plus2 = plus2;
    // mystery animals stay revealed; extra barns bought later are kept (empty)
    for (const B of S.barns) for (const a of B.cells.concat(B.queue)) if (keep[a.id]) a.mystery = false;
    while (S.barns.filter((B) => B.temp).length < temps) addTempBarnRaw(S);
    S.status = 'play'; S.reason = null;
    return true;
  }
  function plus2(S) { const maxCap = Math.floor(S.L / C.GAP) - 1; if (S.cap + C.PLUS2_AMOUNT > maxCap) return false; S.cap += C.PLUS2_AMOUNT; S.plus2++; S.used++; if (S.status === 'lost') { S.status = 'play'; S.reason = null; } return true; }
  function magnet(S, r) {
    // remove every animal of one random color that is not already sorted away
    const kinds = new Set();
    for (const B of S.barns) for (const a of B.cells.concat(B.queue)) if (!B.cleared) kinds.add(a.k);
    for (const a of S.track) kinds.add(a.k);
    const list = [...kinds]; if (!list.length) return null;
    const k = list[Math.floor((r || Math.random)() * list.length)];
    pushHistory(S);
    const gone = [];
    for (const B of S.barns) { B.cells = B.cells.filter((a) => (a.k === k ? (gone.push({ id: a.id, barn: B.id }), false) : true)); B.queue = B.queue.filter((a) => (a.k === k ? (gone.push({ id: a.id, barn: B.id }), false) : true)); }
    S.track = S.track.filter((a) => (a.k === k ? (gone.push({ id: a.id, s: a.s }), false) : true));
    S.removed.push(k); S.used++;
    for (const B of S.barns) { if (B.preset === k) B.preset = null; B.cleared = !B.temp && isCleared(B.cells.map((x) => x.k), B.cap); }
    if (S.status === 'lost') { S.status = 'play'; S.reason = null; }
    updateStatus(S, null);
    return { k, gone };
  }
  function addTempBarnRaw(S) {
    const lay = S.layoutRef; const i = S.barns.filter((B) => B.temp).length; if (i >= C.TEMP_BARN_MAX) return null;
    const B = { id: S.barns.length, temp: true, tempIndex: i, cap: C.TEMP_BARN_CAP, preset: null, dock: lay.temps[i].dock, cleared: false, queue: [], cells: [] };
    S.barns.push(B); return B;
  }
  function addTempBarn(S) { const B = addTempBarnRaw(S); if (!B) return null; S.used++; if (S.status === 'lost') { S.status = 'play'; S.reason = null; } return B; }
  function shuffleColors(S, r) {
    // re-deal the animals of every unsorted barn in pairs, keeping each barn's count; tries for a deal the solver can finish
    r = r || Math.random;
    const bs = S.barns.filter((B) => !B.cleared && !B.temp && B.cells.length);
    if (!bs.length) return false;
    pushHistory(S);
    const pool = []; for (const B of bs) pool.push(...B.cells);
    const byK = {}; for (const a of pool) (byK[a.k] = byK[a.k] || []).push(a);
    let best = null;
    for (let tryN = 0; tryN < 12; tryN++) {
      const chunks = []; for (const k of Object.keys(byK)) { const arr = byK[k].slice(); for (let i = 0; i < arr.length; i += 2) chunks.push(arr.slice(i, i + 2)); }
      shuffle(r, chunks); const flat = [].concat(...chunks);
      let p = 0; const deal = bs.map((B) => { const n = B.cells.length; const c = flat.slice(p, p + n); p += n; return c; });
      best = deal;
      if (!S.track.length && !S.barns.some((B) => B.queue.length)) {
        const board = { cells: S.barns.map((B) => { const j = bs.indexOf(B); return (j >= 0 ? deal[j] : B.cells).map((a) => a.k); }), cap: S.barns.map((B) => B.cap), preset: S.barns.map((B) => B.preset) };
        if (solve(board, 3000).ok) break;
      } else break;
    }
    bs.forEach((B, j) => { B.cells = best[j]; });
    S.used++;
    return true;
  }

  function rewardFor(level) {
    const out = {};
    const rot = C.REWARD_ROTATION[(level - 1) % C.REWARD_ROTATION.length];
    out[rot] = 1;
    if (level % C.BUNDLE_EVERY === 0) for (const k of Object.keys(C.START_BANK)) out[k] = (out[k] || 0) + 1;
    return out;
  }
  function starsFor(S) { return S.used === 0 ? 3 : S.used <= 2 ? 2 : 1; }
  function boardOf(S) { return { cells: S.barns.map((B) => B.cells.map((a) => a.k)), cap: S.barns.map((B) => B.cap), preset: S.barns.map((B) => B.preset) }; }

  return {
    KINDS, CONFIG: C, mulberry32, levelParams, makeLayout, pointAt, topRun, canPark, isCleared, tapBoard, boardWon, solve, replay,
    genAttempt, generateLevel, newGame, tap, step, settle, trackCount, barnCanPark, frontGroup, redo, plus2, magnet, addTempBarn,
    shuffleColors, setSolverWeights, rewardFor, starsFor, boardOf, updateStatus, anyParkable,
  };
});
