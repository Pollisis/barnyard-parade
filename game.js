// Barnyard Parade: pure game logic (rules, level generator, solver, bot). Runs in the browser and in Node.
(function (root, factory) {
  const cfg = (typeof module === 'object' && module.exports) ? require('./config.js') : root.BP_CONFIG;
  const api = factory(cfg);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BPGame = api;
})(this, function (CFGROOT) {
  'use strict';
  const C = CFGROOT.CONFIG;
  const KINDS = ['pig', 'chick', 'sheep', 'frog', 'duck', 'cow', 'bunny', 'hen', 'blacksheep', 'goat'];

  // ---------- helpers ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seedFor = (level, attempt) => (Math.imul(level, 2654435761) ^ Math.imul(attempt + 1, 40503) ^ 0x9e3779b9) >>> 0;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  function shuffle(r, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function levelParams(level) {
    const t = (from, to) => clamp01((level - from) / Math.max(1, to - from));
    return {
      kinds: Math.min(C.KINDS_MAX, KINDS.length, C.KINDS_START + Math.floor((level - 1) / C.KINDS_EVERY)),
      setsMax: Math.round(lerp(C.SETS_MAX_START, C.SETS_MAX_END, t(1, C.SETS_RAMP_LEVEL))),
      hidden: level < C.HIDDEN_FROM_LEVEL ? 0 : lerp(C.HIDDEN_START, C.HIDDEN_MAX, t(C.HIDDEN_FROM_LEVEL, C.HIDDEN_RAMP_LEVEL)),
      glass: level < C.GLASS_FROM_LEVEL ? 0 : Math.min(C.GLASS_MAX, 1 + Math.floor((level - C.GLASS_FROM_LEVEL) / C.GLASS_EVERY)),
      mix: lerp(C.MIX_START, C.MIX_MAX, t(1, C.MIX_RAMP_LEVEL)),
      crateLen: Math.round(lerp(C.CRATE_LEN_START, C.CRATE_LEN_MAX, t(1, C.CRATE_LEN_RAMP_LEVEL))),
      botMin: lerp(C.BOT_MIN_WINRATE_START, C.BOT_MIN_WINRATE_END, t(1, C.BOT_RAMP_LEVEL)),
    };
  }

  // ---------- path processing (shared by the game, generator and solver) ----------
  // path: array of {k,...}; glass: array of {kind, need, crate}. Mutates both. Front = path[0].
  function processPath(path, glass, events) {
    for (;;) {
      if (!path.length) return;
      const f = path[0];
      const g = glass.find((x) => x && x.need > 0 && x.kind === f.k);
      if (g) {
        path.shift(); g.need--;
        if (events) { events.push({ type: 'glass', id: f.id, k: f.k, crate: g.crate, left: g.need }); if (g.need === 0) events.push({ type: 'shatter', crate: g.crate }); }
        continue;
      }
      let kind = null;
      if (countKind(path, f.k) >= C.SET_SIZE) kind = f.k;
      else if (C.CLEAR_ANYWHERE) { for (const a of path) if (countKind(path, a.k) >= C.SET_SIZE) { kind = a.k; break; } }
      if (kind == null) return;
      const ids = []; let n = 0;
      for (let i = 0; i < path.length && n < C.SET_SIZE;) { if (path[i].k === kind) { ids.push(path[i].id); path.splice(i, 1); n++; } else i++; }
      if (events) events.push({ type: 'clear', k: kind, ids });
    }
  }
  function countKind(path, k) { let n = 0; for (const a of path) if (a.k === k) n++; return n; }

  // ---------- game state ----------
  function firstLive(c) { for (let i = 0; i < c.pairs.length; i++) if (!c.pairs[i].gone) return i; return -1; }
  function lastLive(c) { for (let i = c.pairs.length - 1; i >= 0; i--) if (!c.pairs[i].gone) return i; return -1; }
  function isExposed(c, i) { const p = c.pairs[i]; return !!p && !c.glass && !p.gone && (i === firstLive(c) || i === lastLive(c)); }
  function revealEnds(c, events) {
    if (c.glass) return;
    for (const i of [firstLive(c), lastLive(c)]) if (i >= 0 && c.pairs[i].hidden) { c.pairs[i].hidden = false; if (events) events.push({ type: 'reveal', crate: c.id, pair: i }); }
  }
  const glassList = (S) => S.crates.filter((c) => c.glass).map((c) => c.glass);
  function moves(S) { const out = []; for (const c of S.crates) for (let i = 0; i < c.pairs.length; i++) if (isExposed(c, i)) out.push({ c: c.id, i }); return out; }
  function remainingPairs(S) { let n = 0; for (const c of S.crates) for (const p of c.pairs) if (!p.gone) n++; return n; }

  function newGame(lv) {
    const S = {
      level: lv.n, cap: C.PATH_CAPACITY, path: [], nextId: 1, status: 'play', reason: null,
      moves: 0, plus2: 0, used: 0, history: [],
      crates: lv.crates.map((c, id) => ({ id, glass: c.glass ? { kind: c.glass.kind, need: c.glass.need, crate: id } : null, pairs: c.pairs.map((p) => ({ k: p.k, hidden: !!p.hidden, gone: false })) })),
    };
    for (const c of S.crates) revealEnds(c, null);
    return S;
  }
  function snapshot(S) { const { history, ...rest } = S; return clone(rest); }
  function pushHistory(S) { S.history.push(snapshot(S)); if (S.history.length > 200) S.history.shift(); }
  function updateStatus(S) {
    if (!remainingPairs(S) && !S.path.length) { S.status = 'won'; S.reason = null; return; }
    if (S.path.length && S.cap - S.path.length < 2) { S.status = 'lost'; S.reason = 'full'; return; }
    if (!moves(S).length) { S.status = 'lost'; S.reason = 'stuck'; return; }
    S.status = 'play'; S.reason = null;
  }
  function afterChange(S, events) {
    processPath(S.path, glassList(S), events);
    for (const e of events.slice()) if (e.type === 'shatter') { const c = S.crates[e.crate]; c.glass = null; revealEnds(c, events); }
    updateStatus(S);
  }
  function canTap(S, ci, pi) { const c = S.crates[ci]; return S.status === 'play' && !!c && isExposed(c, pi) && S.cap - S.path.length >= 2; }
  function tap(S, ci, pi) {
    if (!canTap(S, ci, pi)) return null;
    pushHistory(S);
    const c = S.crates[ci], p = c.pairs[pi];
    p.gone = true;
    const a = { k: p.k, id: S.nextId++ }, b = { k: p.k, id: S.nextId++ };
    S.path.push(a, b); S.moves++;
    const events = [{ type: 'enter', crate: ci, pair: pi, k: p.k, ids: [a.id, b.id] }];
    revealEnds(c, events);
    afterChange(S, events);
    return events;
  }
  // ---------- power-ups (bank handled by the UI) ----------
  function undo(S) {
    if (!S.history.length) return false;
    const h = S.history; const prev = h.pop();
    Object.assign(S, prev); S.history = h; S.used++;
    return true;
  }
  function canSwapPair(S, ci, pi) { const c = S.crates[ci]; const p = c && c.pairs[pi]; return !!p && !c.glass && !p.gone && !p.hidden; }
  function swap(S, a, b) {
    if (!canSwapPair(S, a.c, a.i) || !canSwapPair(S, b.c, b.i) || (a.c === b.c && a.i === b.i)) return false;
    pushHistory(S);
    const pa = S.crates[a.c].pairs[a.i], pb = S.crates[b.c].pairs[b.i];
    [pa.k, pb.k] = [pb.k, pa.k]; S.used++;
    updateStatus(S);
    return true;
  }
  function canPlus2(S) { return S.plus2 < C.PLUS2_MAX_PER_LEVEL && S.status !== 'won'; }
  function plus2(S) {
    if (!canPlus2(S)) return false;
    pushHistory(S);
    S.cap += C.PLUS2_AMOUNT; S.plus2++; S.used++;
    updateStatus(S);
    return true;
  }
  function magnetPlan(S) {
    if (!S.path.length || S.status === 'won') return null;
    const k = S.path[0].k, have = countKind(S.path, k), need = C.SET_SIZE - have;
    if (need <= 0) return null;
    const cands = [];
    for (const c of S.crates) { if (c.glass) continue; c.pairs.forEach((p, i) => { if (!p.gone && p.k === k) cands.push({ c: c.id, i, rank: isExposed(c, i) ? 0 : p.hidden ? 2 : 1 }); }); }
    cands.sort((x, y) => x.rank - y.rank);
    const pairs = Math.ceil(need / 2);
    if (cands.length < pairs) return null;
    return { k, need, take: cands.slice(0, pairs) };
  }
  function magnet(S) {
    const plan = magnetPlan(S); if (!plan) return null;
    pushHistory(S);
    const pulls = [], pulled = [];
    for (const t of plan.take) {
      const p = S.crates[t.c].pairs[t.i]; p.gone = true;
      const ids = [S.nextId++, S.nextId++]; pulls.push({ crate: t.c, pair: t.i, ids, hidden: p.hidden }); pulled.push(...ids);
    }
    const onPath = S.path.filter((a) => a.k === plan.k).map((a) => a.id);
    S.path = S.path.filter((a) => a.k !== plan.k || onPath.indexOf(a.id) >= C.SET_SIZE);
    const clearIds = onPath.slice(0, C.SET_SIZE).concat(pulled.slice(0, plan.need));
    const extra = pulled.slice(plan.need);
    for (const id of extra) S.path.push({ k: plan.k, id });
    const events = [{ type: 'magnet', k: plan.k, pulls, clearIds, extra }];
    for (const t of plan.take) revealEnds(S.crates[t.c], events);
    S.used++;
    afterChange(S, events);
    return events;
  }

  // ---------- level generation ----------
  // Builds a valid play order first (so a no-power-up win always exists), then packs it into crates.
  function buildSequence(r, pairsOf, glassSpec, mix) {
    const kinds = Object.keys(pairsOf).map(Number);
    const rem = Object.assign({}, pairsOf);
    let left = 0; for (const k of kinds) left += rem[k];
    const path = [], glass = glassSpec.map((g, gi) => ({ kind: g.kind, need: g.need, crate: gi }));
    const seq = []; let nodes = 0;
    function dfs() {
      if (++nodes > 30000) return false;
      if (left === 0) return path.length === 0;
      const front = path.length ? path[0].k : null;
      const opts = kinds.filter((k) => rem[k] > 0).map((k) => {
        let w = 1 + r() * 2;
        if (k === front) w += (1 - mix) * 12;
        w += countKind(path, k) * (1 - mix) * 2;
        if (glass.some((g) => g.need > 0 && g.kind === k) && !path.length) w += 2;
        return { k, w: w * (0.5 + r()) };
      }).sort((a, b) => b.w - a.w);
      for (const o of opts) {
        const savePath = path.slice(), saveNeed = glass.map((g) => g.need);
        rem[o.k]--; left--; path.push({ k: o.k }, { k: o.k }); seq.push(o.k);
        processPath(path, glass, null);
        const ok = !path.length || C.PATH_CAPACITY - path.length >= 2;
        if (ok && dfs()) return true;
        seq.pop(); rem[o.k]++; left++; path.length = 0; path.push(...savePath); glass.forEach((g, i) => { g.need = saveNeed[i]; });
      }
      return false;
    }
    if (!dfs()) return null;
    // replay to find when each glass crate breaks
    const p2 = [], g2 = glassSpec.map((g, gi) => ({ kind: g.kind, need: g.need, crate: gi })), breakAt = glassSpec.map(() => -1);
    seq.forEach((k, t) => { p2.push({ k }, { k }); processPath(p2, g2, null); g2.forEach((g, gi) => { if (g.need === 0 && breakAt[gi] < 0) breakAt[gi] = t; }); });
    return { seq, breakAt };
  }

  // Board geometry in "units" (1 unit = one animal cell). Bands of vertical crates with dirt lanes between them.
  const BW = 14.4, MARGIN = 1.35, CRATE_W = 2.2, LANE_H = 1.15, PER_BAND = 5;
  function makeLayout(crateLens, glassIdx) {
    // crateLens: array of lengths, glassIdx: set of crate indices that are glass (placed in the bottom band)
    const n = crateLens.length;
    const wood = [], glass = [];
    for (let i = 0; i < n; i++) (glassIdx.has(i) ? glass : wood).push(i);
    const bands = [[], [], [], []];
    const total = n;
    const used = Math.max(2, Math.min(4, Math.ceil(total / 4)));
    const order = [[1, 2], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 3]][used - 1] || [0, 1, 2, 3];
    const bandList = glass.length ? Array.from(new Set(order.concat([3]))).sort() : order.slice().sort();
    // bottom band gets glass first
    for (const g of glass) bands[3].push(g);
    const woodBands = bandList.slice();
    let wi = 0;
    const per = Math.ceil(wood.length / Math.max(1, woodBands.length - (glass.length >= 3 ? 1 : 0)));
    for (const b of woodBands) {
      while (bands[b].length < PER_BAND && bands[b].length < per && wi < wood.length) {
        bands[b].push(wood[wi++]);
      }
    }
    for (const b of [0, 1, 2, 3]) while (wi < wood.length && bands[b].length < PER_BAND) bands[b].push(wood[wi++]);
    if (wi < wood.length) return null;
    const crates = new Array(n);
    const lanes = [];
    const maxPer = Math.max(...bands.map((b) => b.length));
    const BWL = Math.max(9.2, 2 * MARGIN + maxPer * CRATE_W + (maxPer + 1) * 0.3);
    let y = 0.35;
    for (let b = 0; b < 4; b++) {
      const list = bands[b];
      const h = list.length ? Math.max(...list.map((i) => crateLens[i])) + 0.3 : 0.5;
      const inner = BWL - 2 * MARGIN, gap = (inner - list.length * CRATE_W) / (list.length + 1);
      list.forEach((ci, j) => {
        const len = crateLens[ci], ch = len + 0.3;
        const x = MARGIN + gap + j * (CRATE_W + gap);
        const cy = b === 0 ? y + h - ch : b === 3 ? y : y + (h - ch) / 2;
        crates[ci] = { x, y: cy, w: CRATE_W, h: ch, band: b };
      });
      y += h;
      if (b < 3) { lanes.push(y + LANE_H / 2); y += LANE_H; }
    }
    const H = y + 0.35;
    const xl = 0.68, xr = BWL - 0.68;
    const path = [
      { x: BWL - 0.05, y: lanes[0] }, { x: xl, y: lanes[0] }, { x: xl, y: lanes[1] },
      { x: xr, y: lanes[1] }, { x: xr, y: lanes[2] }, { x: 1.0, y: lanes[2] },
    ];
    return { W: BWL, H, crates, path, lanes };
  }

  function genAttempt(level, attempt) {
    const r = mulberry32(seedFor(level, attempt));
    const P = levelParams(level);
    const kinds = shuffle(r, KINDS.map((_, i) => i)).slice(0, P.kinds);
    // glass crates
    const glassSpec = [];
    const nGlass = P.glass ? (r() < 0.75 ? P.glass : P.glass - 1) : 0;
    for (let g = 0; g < nGlass; g++) glassSpec.push({ kind: kinds[ri(r, 0, kinds.length - 1)], need: C.GLASS_COUNTS[ri(r, 0, C.GLASS_COUNTS.length - 1)] });
    const pairsOf = {};
    for (const k of kinds) pairsOf[k] = ri(r, 1, P.setsMax) * (C.SET_SIZE / 2);
    for (const g of glassSpec) pairsOf[g.kind] += g.need / 2;
    const sq = buildSequence(r, pairsOf, glassSpec, P.mix);
    if (!sq) return null;
    const T = sq.seq.length;
    // crate sizes
    const glassContent = glassSpec.map((g, gi) => Math.min(ri(r, C.GLASS_CONTENT[0], C.GLASS_CONTENT[1]), T - 1 - sq.breakAt[gi]));
    if (glassContent.some((c) => c < 1)) return null;
    let W = T - glassContent.reduce((a, b) => a + b, 0);
    const maxLen = P.crateLen;
    const woodLens = [];
    while (W > 0) {
      let len = Math.min(W, ri(r, Math.max(2, maxLen - 1), maxLen));
      if (W - len === 1) len = Math.min(maxLen, len + 1) === len ? len - 1 : len + 1;
      if (len <= 0) len = W;
      woodLens.push(len); W -= len;
    }
    const lens = glassContent.concat(woodLens);
    const glassIdx = new Set(glassSpec.map((_, i) => i));
    if (lens.length > 20) return null;
    const layout = makeLayout(lens, glassIdx);
    if (!layout) return null;
    // assign the play order to crate ends
    const fill = lens.map(() => ({ L: [], R: [] })), count = lens.map(() => 0);
    for (let t = 0; t < T; t++) {
      const k = sq.seq[t];
      let elig = [];
      for (let ci = 0; ci < lens.length; ci++) {
        if (count[ci] >= lens[ci]) continue;
        if (glassIdx.has(ci)) { if (sq.breakAt[ci] >= t) continue; elig.push({ ci, w: 50 }); }
        else elig.push({ ci, w: lens[ci] - count[ci] });
      }
      if (!elig.length) return null;
      // wood crates must keep enough room for what is left after glass is filled
      let sum = 0; for (const e of elig) sum += e.w;
      let x = r() * sum, pick = elig[0].ci;
      for (const e of elig) { x -= e.w; if (x <= 0) { pick = e.ci; break; } }
      (r() < 0.5 ? fill[pick].L : fill[pick].R).push(k); count[pick]++;
    }
    if (count.some((c, i) => c !== lens[i])) return null;
    const crates = fill.map((f, ci) => {
      const ks = f.L.concat(f.R.slice().reverse());
      const pairs = ks.map((k, i) => ({ k, hidden: (i > 0 && i < ks.length - 1 || glassIdx.has(ci)) && r() < (glassIdx.has(ci) ? Math.max(P.hidden, 0.3) : P.hidden) }));
      return { pairs, glass: glassIdx.has(ci) ? { kind: glassSpec[ci].kind, need: glassSpec[ci].need } : null };
    });
    return { n: level, attempt, params: P, crates, layout, intended: sq.seq };
  }

  // Full-information solver: is there a win with no power-ups?
  function solve(lv, limit) {
    limit = limit || C.SOLVER_NODE_LIMIT;
    const cr = lv.crates.map((c) => c.pairs.map((p) => p.k));
    const lo = cr.map(() => 0), hi = cr.map((c) => c.length);
    const glass = lv.crates.map((c, i) => (c.glass ? { kind: c.glass.kind, need: c.glass.need, crate: i } : null));
    const gl = glass.filter(Boolean);
    let path = [], left = 0; for (const c of cr) left += c.length;
    const seen = new Set(); let nodes = 0; const sol = [];
    const key = () => lo.join(',') + '|' + hi.join(',') + '|' + path.map((a) => a.k).join('') + '|' + gl.map((g) => g.need).join(',');
    function dfs() {
      if (left === 0) return path.length === 0;
      if (++nodes > limit) throw new Error('limit');
      const kk = key(); if (seen.has(kk)) return false; seen.add(kk);
      const front = path.length ? path[0].k : -1;
      const mv = [];
      for (let i = 0; i < cr.length; i++) {
        if (lo[i] >= hi[i]) continue;
        if (glass[i] && glass[i].need > 0) continue;
        mv.push({ i, end: 0, k: cr[i][lo[i]] });
        if (hi[i] - 1 > lo[i]) mv.push({ i, end: 1, k: cr[i][hi[i] - 1] });
      }
      const score = (m) => (m.k === front ? 100 : 0) + countKind(path, m.k) * 10 + (gl.some((g) => g.need > 0 && g.kind === m.k) ? 5 : 0);
      mv.sort((a, b) => score(b) - score(a));
      for (const m of mv) {
        const sp = path.slice(), sn = gl.map((g) => g.need);
        if (m.end === 0) lo[m.i]++; else hi[m.i]--;
        left--; path.push({ k: m.k }, { k: m.k });
        processPath(path, gl, null);
        sol.push(m);
        if ((!path.length || C.PATH_CAPACITY - path.length >= 2) && dfs()) return true;
        sol.pop();
        path = sp; gl.forEach((g, j) => { g.need = sn[j]; }); left++;
        if (m.end === 0) lo[m.i]--; else hi[m.i]++;
      }
      return false;
    }
    try { const ok = dfs(); return { ok, nodes, solution: ok ? sol.map((m) => ({ c: m.i, end: m.end, k: m.k })) : null }; }
    catch (e) { return { ok: false, nodes, timeout: true }; }
  }

  // "Blind" bot: sees only what a player sees (no peeking under ? tiles or glass). Used to keep levels fair.
  function botPlay(lv, r) {
    const S = newGame(lv);
    for (let guard = 0; guard < 500 && S.status === 'play'; guard++) {
      const mv = moves(S).filter((m) => canTap(S, m.c, m.i));
      if (!mv.length) break;
      const front = S.path.length ? S.path[0].k : null;
      const visible = {};
      for (const c of S.crates) for (const p of c.pairs) if (!p.gone && !p.hidden && !c.glass) visible[p.k] = (visible[p.k] || 0) + 1;
      const glassWant = {};
      for (const c of S.crates) if (c.glass && c.glass.need > 0) glassWant[c.glass.kind] = 1;
      let best = null, bs = -1e9;
      for (const m of mv) {
        const k = S.crates[m.c].pairs[m.i].k;
        let s = r() * 3;
        if (k === front) s += 100;
        s += countKind(S.path, k) * 12;
        if (glassWant[k]) s += S.path.length ? 2 : 30;
        s += (visible[k] || 0) * 1.5;
        const free = S.cap - S.path.length;
        if (front != null && k !== front && free <= 4) s -= 60;
        if (s > bs) { bs = s; best = m; }
      }
      tap(S, best.c, best.i);
    }
    return S.status === 'won';
  }
  function botWinRate(lv, runs, seed) {
    const r = mulberry32(seed || 12345); let w = 0;
    for (let i = 0; i < runs; i++) if (botPlay(lv, r)) w++;
    return w / runs;
  }

  const cache = {};
  function generateLevel(level) {
    if (cache[level]) return cache[level];
    const P = levelParams(level);
    let fallback = null;
    for (let attempt = 0; attempt < C.GEN_MAX_TRIES; attempt++) {
      const lv = genAttempt(level, attempt);
      if (!lv) continue;
      const s = solve(lv);
      if (!s.ok) continue;
      lv.solverNodes = s.nodes;
      lv.botRate = botWinRate(lv, C.BOT_RUNS, seedFor(level, attempt) ^ 77);
      if (!fallback || lv.botRate > fallback.botRate) fallback = lv;
      if (lv.botRate >= P.botMin) { cache[level] = lv; return lv; }
    }
    if (fallback) { cache[level] = fallback; return fallback; }
    throw new Error('could not generate level ' + level);
  }

  function rewardFor(level) {
    const out = {};
    const rot = C.REWARD_ROTATION[(level - 1) % C.REWARD_ROTATION.length];
    out[rot] = 1;
    if (level % C.BUNDLE_EVERY === 0) for (const k of C.REWARD_ROTATION) out[k] = (out[k] || 0) + 1;
    return out;
  }
  function starsFor(S) { return S.used === 0 ? 3 : S.used <= 2 ? 2 : 1; }

  return {
    KINDS, CONFIG: C, mulberry32, levelParams, processPath, countKind, newGame, tap, canTap, isExposed, moves,
    remainingPairs, undo, swap, canSwapPair, plus2, canPlus2, magnet, magnetPlan, updateStatus, generateLevel,
    genAttempt, buildSequence, makeLayout, solve, botPlay, botWinRate, rewardFor, starsFor, firstLive, lastLive, snapshot,
  };
});
