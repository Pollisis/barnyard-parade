// Barnyard Parade: rendering, animation, input, HUD, dialogs, saving.
(function () {
  'use strict';
  const G = window.BPGame, ART = window.BPArt, AU = window.BPAudio, CF = window.BP_CONFIG, C = CF.CONFIG;
  const $ = (s) => document.querySelector(s);
  document.title = CF.GAME_NAME;
  document.querySelectorAll('[data-name]').forEach((e) => { e.textContent = CF.GAME_NAME; });

  // ---------- save data ----------
  const KEY = 'barnyard-parade.save.v1';
  function defaults() { return { maxLevel: 1, current: 1, stars: {}, cleared: {}, bank: Object.assign({}, C.START_BANK), settings: { music: 0.5, sfx: 0.8, muted: false }, seenHelp: false }; }
  let save;
  try { save = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { save = defaults(); }
  for (const k of Object.keys(C.START_BANK)) if (typeof save.bank[k] !== 'number') save.bank[k] = 0;
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
  AU.set(save.settings);

  // ---------- state ----------
  const cv = $('#board'), ctx = cv.getContext('2d');
  let lv = null, S = null, layout = null;
  let view = { u: 30, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  let pathGeo = null;
  let sprites = new Map(); // id -> sprite
  let dispPath = [];       // ids in display order (front first)
  let glassShown = {};     // crate -> displayed counter (null when shattered on screen)
  let queue = [], qTimer = 0, playing = false;
  let particles = [], popups = [], shakes = {}, flips = {}, bumps = {};
  let swapMode = null;     // null | {first:{c,i}|null}
  let modalOpen = false, gridBg = null, time = 0;

  // ---------- geometry ----------
  function buildPathGeo() {
    const pts = layout.path; const segs = []; let L = 0;
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const len = Math.hypot(b.x - a.x, b.y - a.y); segs.push({ a, b, len, s0: L }); L += len; }
    pathGeo = { segs, L };
  }
  function pointAt(s) {
    s = Math.max(0, Math.min(pathGeo.L, s));
    for (const g of pathGeo.segs) if (s <= g.s0 + g.len + 1e-6) { const t = (s - g.s0) / g.len; return { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t, dx: Math.sign(g.b.x - g.a.x) }; }
    const p = layout.path[layout.path.length - 1]; return { x: p.x, y: p.y, dx: -1 };
  }
  const spacing = () => pathGeo.L / (S.cap + 0.6);
  const slotS = (i) => pathGeo.L - spacing() * (i + 0.6);
  function cellCenter(ci, pi, side) { const r = layout.crates[ci]; return { x: r.x + 0.1 + 0.5 + side, y: r.y + 0.15 + pi + 0.5 }; }
  const toPx = (x, y) => ({ x: view.ox + x * view.u, y: view.oy + y * view.u });
  function resize() {
    const r = cv.getBoundingClientRect();
    view.dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * view.dpr); cv.height = Math.round(r.height * view.dpr);
    view.w = r.width; view.h = r.height;
    if (!layout) return;
    view.u = Math.min(r.width / (layout.W + 0.2), r.height / (layout.H + 0.2));
    view.ox = (r.width - layout.W * view.u) / 2; view.oy = Math.max(0, (r.height - layout.H * view.u) / 2);
    gridBg = null;
  }

  // ---------- level flow ----------
  function startLevel(n) {
    n = Math.max(1, Math.min(n, save.maxLevel));
    save.current = n; persist();
    lv = G.generateLevel(n); layout = lv.layout; S = G.newGame(lv);
    buildPathGeo(); resize(); resync();
    queue = []; playing = false; particles = []; popups = []; swapMode = null; hideSwap();
    $('#lvl-text').textContent = 'Level ' + n;
    hud();
    if (n === 1 && !save.seenHelp) setTimeout(showHelp, 300);
    setHint(n <= 2 ? 'Tap a pair of animals to send them down the path. 8 of a kind clear!' : null);
    setTimeout(() => { try { G.generateLevel(n + 1); } catch (e) { /* ignore */ } }, 600);
  }
  function resync() {
    sprites = new Map(); dispPath = [];
    S.path.forEach((a, i) => { const s = slotS(i); const p = pointAt(s); sprites.set(a.id, { id: a.id, k: a.k, mode: 'path', s, x: p.x, y: p.y, bob: Math.random() * 6 }); dispPath.push(a.id); });
    glassShown = {}; S.crates.forEach((c) => { if (c.glass) glassShown[c.id] = c.glass.need; });
  }
  function hud() {
    const n = S ? S.path.length : 0, cap = S ? S.cap : C.PATH_CAPACITY;
    const shown = dispPath.length;
    const capEl = $('#cap'); $('#cap-text').textContent = shown + '/' + cap; capEl.classList.toggle('warn', cap - shown <= 3);
    document.querySelectorAll('.pw').forEach((b) => {
      const k = b.dataset.pw; b.querySelector('.cnt').textContent = save.bank[k] || 0;
      b.classList.toggle('empty', !(save.bank[k] > 0)); b.classList.toggle('active', !!(swapMode && k === 'swap'));
    });
    void n;
  }
  function setHint(t) { const h = $('#hint'); if (!t) { h.classList.add('hidden'); return; } h.textContent = t; h.classList.remove('hidden'); }
  let toastT = 0;
  function toast(t, ms) { const e = $('#toast'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.add('hidden'), ms || 1800); }

  // ---------- event playback ----------
  function enqueue(events) { for (const e of events) queue.push(e); if (!playing) pump(); }
  function pump() {
    if (!queue.length) { playing = false; hud(); onSettled(); return; }
    playing = true;
    const e = queue.shift();
    const wait = playEvent(e);
    hud();
    qTimer = setTimeout(pump, wait * 1000);
  }
  function retarget() { dispPath.forEach((id, i) => { const sp = sprites.get(id); if (sp) sp.target = slotS(i); }); }
  function playEvent(e) {
    const now = performance.now() / 1000;
    switch (e.type) {
      case 'enter': {
        AU.fx.animal(e.k); AU.fx.hop();
        e.ids.forEach((id, j) => {
          const from = cellCenter(e.crate, e.pair, j);
          dispPath.push(id);
          const s = slotS(dispPath.length - 1), to = pointAt(s);
          sprites.set(id, { id, k: e.k, mode: 'hop', x: from.x, y: from.y, fx: from.x, fy: from.y, s, target: s, t0: now + j * 0.05, dur: 0.38, bob: Math.random() * 6, tx: to.x, ty: to.y });
        });
        bumpCap();
        return 0.2;
      }
      case 'reveal': flips[e.crate + ':' + e.pair] = now; AU.fx.pop(); return 0.02;
      case 'glass': {
        const sp = sprites.get(e.id); const r = layout.crates[e.crate];
        removeFromPath(e.id);
        if (sp) flyTo(sp, r.x + r.w / 2, r.y + r.h / 2, 0.38, () => { glassShown[e.crate] = e.left; AU.fx.glass(); bumps[e.crate] = performance.now() / 1000; });
        return 0.16;
      }
      case 'shatter': {
        setTimeout(() => {
          glassShown[e.crate] = null; AU.fx.shatter();
          const r = layout.crates[e.crate];
          for (let i = 0; i < 26; i++) particles.push({ x: r.x + Math.random() * r.w, y: r.y + Math.random() * r.h, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 6 - 1, life: 0.9, t: 0, col: Math.random() < 0.5 ? '#bff3ff' : '#e9fbff', sz: 0.12 + Math.random() * 0.2, shard: true });
        }, 400);
        return 0.5;
      }
      case 'clear': case 'magnet': {
        const hole = layout.path[layout.path.length - 1];
        const ids = e.type === 'clear' ? e.ids : e.clearIds;
        if (e.type === 'magnet') {
          AU.fx.power();
          e.pulls.forEach((p, pj) => p.ids.forEach((id, j) => {
            const from = cellCenter(p.crate, p.pair, j);
            sprites.set(id, { id, k: e.k, mode: 'fly', x: from.x, y: from.y, bob: 0 });
          }));
        }
        AU.fx.whoosh(); setTimeout(() => AU.fx.clear(), 250);
        ids.forEach((id, j) => {
          const sp = sprites.get(id); if (!sp) return;
          removeFromPath(id);
          setTimeout(() => flyTo(sp, hole.x, hole.y, 0.45, () => sprites.delete(id), true), j * 45);
        });
        if (e.type === 'magnet') for (const id of e.extra) { dispPath.push(id); const sp = sprites.get(id); if (sp) { sp.mode = 'path'; sp.s = slotS(dispPath.length - 1); } }
        popups.push({ text: e.type === 'magnet' ? 'Magnet!' : ['Great!!', 'Yay!!', 'Super!!', 'Moo-velous!'][Math.floor(Math.random() * 4)], x: layout.W / 2, y: layout.lanes[1], t: 0 });
        retarget();
        return 0.55;
      }
    }
    return 0;
  }
  function removeFromPath(id) { const i = dispPath.indexOf(id); if (i >= 0) dispPath.splice(i, 1); retarget(); }
  function flyTo(sp, x, y, dur, done, shrink) {
    Object.assign(sp, { mode: 'fly', fx: sp.x, fy: sp.y, tx: x, ty: y, t0: performance.now() / 1000, dur, done, shrink: !!shrink });
  }
  function bumpCap() { const e = $('#cap'); e.classList.add('bump'); setTimeout(() => e.classList.remove('bump'), 150); }

  function onSettled() {
    if (!S || modalOpen) return;
    if (S.status === 'won') setTimeout(showWin, 450);
    else if (S.status === 'lost') setTimeout(showLost, 350);
  }

  // ---------- input ----------
  function pick(px, py) {
    const x = (px - view.ox) / view.u, y = (py - view.oy) / view.u;
    for (let ci = 0; ci < layout.crates.length; ci++) {
      const r = layout.crates[ci];
      if (x >= r.x - 0.05 && x <= r.x + r.w + 0.05 && y >= r.y - 0.05 && y <= r.y + r.h + 0.05) {
        const pi = Math.max(0, Math.min(S.crates[ci].pairs.length - 1, Math.floor(y - r.y - 0.15)));
        return { type: 'crate', c: ci, i: pi };
      }
    }
    for (const id of dispPath) { const sp = sprites.get(id); if (sp && Math.hypot(sp.x - x, sp.y - y) < 0.6) return { type: 'animal', sp }; }
    return null;
  }
  cv.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); AU.ensure(); if (!AU.playing) AU.startMusic();
    if (!S || modalOpen) return;
    const r = cv.getBoundingClientRect(); const h = pick(ev.clientX - r.left, ev.clientY - r.top);
    if (!h) return;
    if (h.type === 'animal') { AU.fx.animal(h.sp.k); h.sp.squashT = performance.now() / 1000; return; }
    const c = S.crates[h.c], p = c.pairs[h.i];
    if (swapMode) { doSwapPick(h.c, h.i); return; }
    if (S.status !== 'play' && queue.length === 0 && !playing) { onSettled(); return; }
    if (!p || p.gone) return;
    if (c.glass || glassShown[h.c] != null) { AU.fx.glass(); shakes[h.c] = performance.now() / 1000; toast('Locked! Send ' + (G.countKind ? '' : '') + plural(kindName(glassKind(h.c))) + ' down the path to open the glass'); return; }
    if (!G.isExposed(c, h.i)) { AU.fx.nope(); shakes[h.c] = performance.now() / 1000; if (!p.hidden) AU.fx.animal(p.k); return; }
    if (S.cap - S.path.length < 2) { AU.fx.nope(); toast('The path is full!'); return; }
    const evs = G.tap(S, h.c, h.i);
    if (evs) { setHint(null); enqueue(evs); }
  });

  // ---------- power-ups ----------
  function usePower(k) {
    AU.ensure();
    if (playing || queue.length) return;
    if (modalOpen) closeModal();
    if (!(save.bank[k] > 0)) { AU.fx.nope(); toast('No ' + niceName(k) + ' left. Clear levels to earn more!'); return; }
    let ok = false;
    if (k === 'undo') { ok = G.undo(S); if (ok) { resync(); hud(); } else toast('Nothing to undo yet'); }
    else if (k === 'plus2') { ok = G.plus2(S); if (ok) { retarget(); popups.push({ text: '+2 space!', x: layout.W / 2, y: layout.lanes[1], t: 0 }); } else toast('Path space can only be added twice per level'); }
    else if (k === 'magnet') {
      const plan = G.magnetPlan(S);
      if (!plan) { toast(S.path.length ? 'Not enough of that animal left on the board' : 'Send an animal down the path first. The magnet finishes the set for the animal at the front.', 2600); }
      else { const evs = G.magnet(S); ok = !!evs; if (evs) enqueue(evs); }
    } else if (k === 'swap') {
      if (swapMode) { cancelSwap(); return; }
      swapMode = { first: null }; $('#swapbar').classList.remove('hidden'); hud(); return;
    }
    if (ok) { save.bank[k]--; persist(); AU.fx.power(); hud(); if (S.status === 'play') { /* resumed */ } else onSettled(); }
  }
  function doSwapPick(ci, pi) {
    if (!G.canSwapPair(S, ci, pi) || glassShown[ci] != null) { AU.fx.nope(); return; }
    AU.fx.animal(S.crates[ci].pairs[pi].k);
    if (!swapMode.first) { swapMode.first = { c: ci, i: pi }; return; }
    const a = swapMode.first;
    if (a.c === ci && a.i === pi) { swapMode.first = null; return; }
    if (G.swap(S, a, { c: ci, i: pi })) {
      save.bank.swap--; persist(); AU.fx.power();
      flips[a.c + ':' + a.i] = flips[ci + ':' + pi] = performance.now() / 1000;
    }
    cancelSwap(); onSettled();
  }
  function cancelSwap() { swapMode = null; hideSwap(); hud(); }
  function hideSwap() { $('#swapbar').classList.add('hidden'); }
  const plural = (k) => ({ sheep: 'sheep', blacksheep: 'black sheep' })[k] || ART.ANIMALS[k].name.toLowerCase() + 's';
  const niceName = (k) => ({ undo: 'Undo', swap: 'Swap', plus2: '+2 Space', magnet: 'Magnet' })[k];
  document.querySelectorAll('.pw').forEach((b) => b.addEventListener('click', () => usePower(b.dataset.pw)));
  $('#swap-cancel').addEventListener('click', cancelSwap);
  $('#btn-restart').addEventListener('click', () => { AU.fx.click(); if (playing) return; startLevel(save.current); });
  $('#btn-settings').addEventListener('click', () => { AU.fx.click(); showSettings(); });

  // ---------- dialogs ----------
  function modal(title, body, buttons) {
    modalOpen = true; $('#m-title').textContent = title; $('#m-body').innerHTML = body;
    const bw = $('#m-buttons'); bw.innerHTML = '';
    for (const b of buttons) { const e = document.createElement('button'); e.className = 'btn ' + (b.cls || ''); e.textContent = b.label; e.disabled = !!b.disabled; if (b.id) e.id = b.id; e.onclick = () => { AU.fx.click(); b.fn(); }; bw.appendChild(e); }
    $('#modal').classList.remove('hidden');
  }
  function closeModal() { modalOpen = false; $('#modal').classList.add('hidden'); }
  function showWin() {
    if (modalOpen) return;
    const n = S.level, stars = G.starsFor(S);
    AU.fx.win(); confetti();
    let rewardHtml = '';
    if (!save.cleared[n]) {
      const rw = G.rewardFor(n); save.cleared[n] = 1;
      for (const k of Object.keys(rw)) save.bank[k] = Math.min(C.BANK_MAX, (save.bank[k] || 0) + rw[k]);
      rewardHtml = '<p>Free power-ups saved for later:</p>' + Object.keys(rw).map((k) => '<span class="reward">+' + rw[k] + ' ' + niceName(k) + '</span>').join('');
    }
    save.stars[n] = Math.max(save.stars[n] || 0, stars);
    save.maxLevel = Math.max(save.maxLevel, n + 1); save.current = n + 1; persist(); hud();
    const st = [1, 2, 3].map((i) => '<span class="' + (i <= stars ? 'on' : 'off') + '" style="animation-delay:' + (i * 0.15) + 's">★</span>').join('');
    modal('Level ' + n + ' complete!', '<div class="stars">' + st + '</div><p>' + (stars === 3 ? 'Perfect, no power-ups needed!' : 'Nice work!') + '</p>' + rewardHtml,
      [{ label: 'Map', cls: 'blue', fn: () => { closeModal(); showMap(); } }, { label: 'Next level', id: 'btn-next', fn: () => { closeModal(); startLevel(n + 1); } }]);
  }
  function showLost() {
    if (modalOpen) return;
    AU.fx.lose();
    const b = save.bank, full = S.reason === 'full';
    const canMag = !!G.magnetPlan(S);
    const btns = [];
    if (b.undo > 0) btns.push({ label: 'Undo (' + b.undo + ')', cls: 'blue', fn: () => { closeModal(); usePower('undo'); } });
    if (b.plus2 > 0 && G.canPlus2(S)) btns.push({ label: '+2 Space (' + b.plus2 + ')', cls: 'orange', fn: () => { closeModal(); usePower('plus2'); } });
    if (b.magnet > 0 && canMag) btns.push({ label: 'Magnet (' + b.magnet + ')', cls: 'orange', fn: () => { closeModal(); usePower('magnet'); } });
    btns.push({ label: 'Retry', id: 'btn-retry', fn: () => { closeModal(); startLevel(S.level); } });
    modal(full ? 'Path full!' : 'No moves left!', full ? '<p>The animal at the front has nowhere to go, and the path is out of room.</p><p>Every level can be won without power-ups. Try a new order, or use one you saved.</p>' : '<p>There are no animals left you can tap.</p>', btns);
  }
  function showSettings() {
    const s = save.settings;
    modal('Settings', '<div class="row"><label>Music</label><input id="s-music" type="range" min="0" max="1" step="0.05" value="' + s.music + '"></div>' +
      '<div class="row"><label>Sounds</label><input id="s-sfx" type="range" min="0" max="1" step="0.05" value="' + s.sfx + '"></div>' +
      '<div class="row"><label>Mute all</label><input id="s-mute" type="checkbox" ' + (s.muted ? 'checked' : '') + ' style="width:26px;height:26px"></div>' +
      '<p class="small">' + CF.GAME_NAME + ' v' + CF.VERSION + '. No ads, no store, no lives. Progress is saved on this device.</p>',
    [{ label: 'Level map', cls: 'blue', fn: () => { closeModal(); showMap(); } }, { label: 'How to play', cls: 'orange', fn: showHelp }, { label: 'Close', fn: closeModal },
      { label: 'Reset progress', cls: 'grey', fn: () => { if (confirm('Erase all progress and saved power-ups?')) { const st = save.settings; save = defaults(); save.settings = st; save.seenHelp = true; persist(); closeModal(); startLevel(1); } } }]);
    const upd = () => { s.music = +$('#s-music').value; s.sfx = +$('#s-sfx').value; s.muted = $('#s-mute').checked; AU.set(s); persist(); };
    $('#s-music').oninput = upd; $('#s-sfx').oninput = () => { upd(); AU.fx.pop(); }; $('#s-mute').onchange = upd;
  }
  function showHelp() {
    save.seenHelp = true; persist();
    modal('How to play', '<p>Tap a pair of animals at the <b>end</b> of a crate. They hop onto the path and line up.</p><p>When <b>8 of the same animal</b> are on the path and one of them is at the front, they all go home!</p><p>Only the front animal can leave, so plan your order. The path holds 12.</p><p>Glass crates open when you send them the animal they ask for. <b>?</b> tiles flip over when the pair beside them leaves.</p><p>Power-ups are free, earned by playing, and saved between levels.</p>',
      [{ label: "Let's play!", fn: closeModal }]);
  }
  // ---------- level map ----------
  function showMap() {
    const top = save.maxLevel + C.MAP_LEVELS_AHEAD; const box = $('#map-nodes'); box.innerHTML = '';
    const gap = 96; box.style.height = (top * gap + 60) + 'px';
    const svgNS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('style', 'position:absolute;left:0;top:0;width:100%;height:100%'); box.appendChild(svg);
    const W = Math.min(480, window.innerWidth); let d = '';
    const posOf = (n) => ({ x: W / 2 + Math.sin(n * 1.1) * W * 0.28, y: (top - n) * gap + 60 });
    for (let n = 1; n <= top; n++) { const p = posOf(n); d += (n === 1 ? 'M' : 'L') + p.x + ' ' + p.y; }
    const pathEl = document.createElementNS(svgNS, 'path'); pathEl.setAttribute('d', d); pathEl.setAttribute('fill', 'none'); pathEl.setAttribute('stroke', '#e8c98a'); pathEl.setAttribute('stroke-width', '22'); pathEl.setAttribute('stroke-linejoin', 'round'); svg.appendChild(pathEl);
    for (let n = 1; n <= top; n++) {
      const p = posOf(n); const e = document.createElement('button');
      const locked = n > save.maxLevel; e.className = 'node' + (locked ? ' locked' : '') + (n === save.current ? ' current' : '');
      e.style.left = p.x + 'px'; e.style.top = (p.y - 37) + 'px'; e.dataset.level = n;
      const st = save.stars[n] || 0;
      e.innerHTML = (locked ? '🔒' : n) + (st ? '<span class="ns">' + '★'.repeat(st) + '</span>' : '');
      e.onclick = () => { if (locked) { AU.fx.nope(); return; } AU.fx.click(); $('#map').classList.add('hidden'); startLevel(n); };
      box.appendChild(e);
    }
    $('#map-bank').textContent = 'Undo ' + save.bank.undo + ' · Swap ' + save.bank.swap + ' · +2 ' + save.bank.plus2 + ' · Magnet ' + save.bank.magnet;
    $('#map-play').textContent = 'Play level ' + Math.min(save.current, save.maxLevel);
    $('#map').classList.remove('hidden');
    const cur = posOf(Math.min(save.current, save.maxLevel)); $('#map-scroll').scrollTop = cur.y - window.innerHeight / 2;
  }
  $('#map-close').onclick = () => { AU.fx.click(); $('#map').classList.add('hidden'); };
  $('#map-play').onclick = () => { AU.fx.click(); $('#map').classList.add('hidden'); startLevel(Math.min(save.current, save.maxLevel)); };

  function confetti() {
    const cols = ['#ff6f91', '#ffd83a', '#5aa8f5', '#6fd35a', '#ff8a2a', '#b48ae6'];
    for (let i = 0; i < 90; i++) particles.push({ x: Math.random() * layout.W, y: -0.5 - Math.random() * 3, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 2, life: 3, t: 0, col: cols[i % cols.length], sz: 0.15 + Math.random() * 0.15, rot: Math.random() * 6, conf: true });
  }

  // ---------- drawing ----------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawBackground() {
    if (!gridBg || gridBg.width !== cv.width || gridBg.height !== cv.height) {
      gridBg = document.createElement('canvas'); gridBg.width = cv.width; gridBg.height = cv.height;
      const c = gridBg.getContext('2d'); const g = c.createRadialGradient(cv.width / 2, cv.height * 0.4, 10, cv.width / 2, cv.height / 2, cv.height);
      g.addColorStop(0, '#8fd86a'); g.addColorStop(1, '#64b847'); c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
      const r = G.mulberry32(7);
      for (let i = 0; i < 140; i++) {
        const x = r() * cv.width, y = r() * cv.height, s = (4 + r() * 6) * view.dpr;
        c.strokeStyle = r() < 0.5 ? '#5aa83f' : '#a3e07e'; c.lineWidth = 2 * view.dpr; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - s * 0.4, y - s); c.moveTo(x, y); c.lineTo(x + s * 0.3, y - s * 1.1); c.stroke();
        if (r() < 0.12) { c.fillStyle = ['#fff', '#ffe36b', '#ffb3c8'][Math.floor(r() * 3)]; c.beginPath(); c.arc(x + s, y - s, 2.5 * view.dpr, 0, 7); c.fill(); }
      }
    }
    ctx.drawImage(gridBg, 0, 0);
  }
  function drawPath(c, u) {
    const pts = layout.path;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    const trace = () => { c.beginPath(); pts.forEach((p, i) => { const q = toPx(p.x, p.y); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); };
    trace(); c.strokeStyle = '#c99a5e'; c.lineWidth = u * 1.12; c.stroke();
    trace(); c.strokeStyle = '#f2d59a'; c.lineWidth = u * 0.95; c.stroke();
    c.setLineDash([u * 0.08, u * 0.6]); trace(); c.strokeStyle = '#e2bf7d'; c.lineWidth = u * 0.12; c.stroke(); c.setLineDash([]);
    // entry bush
    const a = toPx(pts[0].x, pts[0].y);
    for (const [dx, dy, rr2, col] of [[0.1, -0.5, 0.55, '#4f9e3a'], [0.35, 0.25, 0.55, '#4f9e3a'], [0.2, -0.1, 0.5, '#5fb848'], [0.0, -0.45, 0.18, '#ff9fc2'], [0.3, 0.3, 0.15, '#fff']]) { c.beginPath(); c.arc(a.x + dx * u, a.y + dy * u, rr2 * u, 0, 7); c.fillStyle = col; c.fill(); }
    // exit hole (front of the line)
    const b = toPx(pts[pts.length - 1].x, pts[pts.length - 1].y);
    c.beginPath(); c.ellipse(b.x - u * 0.25, b.y, u * 0.62, u * 0.5, 0, 0, 7); c.fillStyle = '#8a5a2a'; c.fill();
    c.beginPath(); c.ellipse(b.x - u * 0.25, b.y + u * 0.04, u * 0.48, u * 0.36, 0, 0, 7); c.fillStyle = '#3a2412'; c.fill();
    c.font = '900 ' + Math.round(u * 0.32) + 'px system-ui'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText('HOME', b.x - u * 0.25, b.y - u * 0.62);
    c.restore();
  }
  function drawCrate(c, ci, u, now) {
    const r = layout.crates[ci], cr = S.crates[ci];
    let sx = 0; const sh = shakes[ci]; if (sh && now - sh < 0.3) sx = Math.sin((now - sh) * 60) * 0.06 * (1 - (now - sh) / 0.3);
    const P = toPx(r.x + sx, r.y);
    const w = r.w * u, h = r.h * u;
    c.save();
    c.fillStyle = '#0002'; rr(c, P.x + u * 0.06, P.y + u * 0.1, w, h, u * 0.18); c.fill();
    c.fillStyle = '#b97a3e'; rr(c, P.x, P.y, w, h, u * 0.18); c.fill();
    c.strokeStyle = '#7c4a1c'; c.lineWidth = u * 0.06; c.stroke();
    c.fillStyle = '#6e4322'; rr(c, P.x + u * 0.08, P.y + u * 0.12, w - u * 0.16, h - u * 0.24, u * 0.1); c.fill();
    const glassOn = glassShown[ci] != null;
    cr.pairs.forEach((p, pi) => {
      const y = P.y + (0.15 + pi) * u;
      c.fillStyle = (pi % 2) ? '#7a4c27' : '#744824'; c.fillRect(P.x + u * 0.1, y, u * 2, u);
      if (p.gone) return;
      const fl = flips[ci + ':' + pi]; let fs = 1;
      if (fl && now - fl < 0.3) fs = Math.abs(Math.cos((now - fl) / 0.3 * Math.PI));
      if (p.hidden) {
        for (let s = 0; s < 2; s++) {
          const x = P.x + (0.1 + s) * u;
          c.fillStyle = '#3c3a4a'; rr(c, x + u * 0.07, y + u * 0.07, u * 0.86, u * 0.86, u * 0.14); c.fill();
          c.strokeStyle = '#555268'; c.lineWidth = u * 0.05; c.stroke();
          c.fillStyle = '#9a96b4'; c.font = '900 ' + Math.round(u * 0.55) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x + u * 0.5, y + u * 0.53);
        }
        return;
      }
      const exposed = !glassOn && G.isExposed(cr, pi);
      const sel = swapMode && swapMode.first && swapMode.first.c === ci && swapMode.first.i === pi;
      if (sel) { c.fillStyle = '#ffe14d'; rr(c, P.x + u * 0.1, y, u * 2, u, u * 0.15); c.fill(); }
      else if (swapMode && !glassOn) { c.fillStyle = '#ffffff22'; c.fillRect(P.x + u * 0.1, y, u * 2, u); }
      for (let s = 0; s < 2; s++) {
        const bob = exposed ? Math.sin(now * 3 + ci + pi * 0.7 + s * 0.4) * 0.03 : 0;
        const blink = ((now * 0.7 + ci * 0.37 + pi * 0.53 + s * 0.11) % 4) < 0.12;
        ART.drawAnimal(c, p.k, P.x + (0.1 + s + 0.5) * u, y + (0.5 + bob) * u, u, { scale: fs * (exposed ? 1 : 0.92), squash: (1 - fs) * 0.3, blink, alpha: glassOn ? 0.55 : 1 });
      }
    });
    if (glassOn) {
      const gx = P.x + u * 0.05, gy = P.y + u * 0.05, gw = w - u * 0.1, gh = h - u * 0.1;
      const bmp = bumps[ci] && now - bumps[ci] < 0.25 ? 1 + 0.06 * Math.sin((now - bumps[ci]) / 0.25 * Math.PI) : 1;
      const grd = c.createLinearGradient(gx, gy, gx + gw, gy + gh); grd.addColorStop(0, '#9ff0ffcc'); grd.addColorStop(1, '#4fc3e8b0');
      c.fillStyle = grd; rr(c, gx, gy, gw, gh, u * 0.14); c.fill(); c.strokeStyle = '#e8fbff'; c.lineWidth = u * 0.08; c.stroke();
      c.save(); rr(c, gx, gy, gw, gh, u * 0.14); c.clip(); c.strokeStyle = '#ffffff70'; c.lineWidth = u * 0.22;
      for (let k = -1; k < 4; k++) { c.beginPath(); c.moveTo(gx + k * u * 1.2, gy + gh); c.lineTo(gx + k * u * 1.2 + gh * 0.6, gy); c.stroke(); } c.restore();
      const cx = P.x + w / 2, cy = P.y + h / 2;
      ART.drawAnimal(c, kindName(glassKind(ci)), cx, cy - u * 0.55, u * 0.95 * bmp);
      c.beginPath(); c.arc(cx, cy + u * 0.4, u * 0.42 * bmp, 0, 7); c.fillStyle = '#2f7fe0'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = u * 0.07; c.stroke();
      c.fillStyle = '#fff'; c.font = '900 ' + Math.round(u * 0.5 * bmp) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(glassShown[ci]), cx, cy + u * 0.43);
    }
    c.restore();
  }
  function glassKind(ci) { const g = lv.crates[ci].glass; return g ? g.kind : 0; }
  const kindName = (i) => G.KINDS[i];
  function stepSprites(dt, now) {
    for (const sp of sprites.values()) {
      if (sp.mode === 'hop') {
        const t = (now - sp.t0) / sp.dur; if (t < 0) continue;
        const to = pointAt(sp.target != null ? sp.target : sp.s);
        if (t >= 1) { sp.mode = 'path'; sp.s = sp.target; sp.x = to.x; sp.y = to.y; sp.squashT = now; continue; }
        const e = t; sp.x = sp.fx + (to.x - sp.fx) * e; sp.y = sp.fy + (to.y - sp.fy) * e - Math.sin(Math.PI * e) * 1.6;
      } else if (sp.mode === 'fly') {
        if (sp.t0 == null) continue;
        const t = Math.min(1, (now - sp.t0) / sp.dur); const e = t * t * (3 - 2 * t);
        sp.x = sp.fx + (sp.tx - sp.fx) * e; sp.y = sp.fy + (sp.ty - sp.fy) * e - Math.sin(Math.PI * t) * 1.2;
        sp.scale = sp.shrink ? 1 - 0.7 * t : 1; sp.rot = sp.shrink ? t * 4 : 0;
        if (t >= 1) { const d = sp.done; sp.done = null; sprites.delete(sp.id); if (d) d(); }
      } else if (sp.mode === 'path') {
        if (sp.target == null) sp.target = sp.s;
        const d = sp.target - sp.s; const v = 16 * dt;
        sp.moving = Math.abs(d) > 0.01;
        sp.s += Math.abs(d) < v ? d : Math.sign(d) * v;
        const p = pointAt(sp.s); sp.x = p.x; sp.y = p.y;
      }
    }
  }
  function frame(tms) {
    const now = tms / 1000; const dt = Math.min(0.05, now - (time || now)); time = now;
    if (S) {
      stepSprites(dt, now);
      drawBackground();
      const u = view.u * view.dpr;
      ctx.save(); ctx.scale(view.dpr, view.dpr);
      const uu = view.u;
      drawPath(ctx, uu);
      for (let ci = 0; ci < layout.crates.length; ci++) drawCrate(ctx, ci, uu, now);
      // path animals (back to front so the front draws on top)
      const list = [...sprites.values()].sort((a, b) => (a.mode === 'fly') - (b.mode === 'fly'));
      for (const sp of list) {
        const q = toPx(sp.x, sp.y);
        const walk = sp.mode === 'path' && sp.moving ? Math.abs(Math.sin(now * 14 + sp.bob)) * 0.12 : 0;
        const sq = sp.squashT && now - sp.squashT < 0.25 ? Math.sin((now - sp.squashT) / 0.25 * Math.PI) * 0.18 : 0;
        const blink = ((now * 0.8 + sp.bob) % 3.5) < 0.12;
        ART.drawAnimal(ctx, sp.k, q.x, q.y - walk * uu, uu * 0.92, { scale: sp.scale || 1, rot: sp.rot || 0, squash: sq, blink });
      }
      // front marker
      if (dispPath.length) { const f = sprites.get(dispPath[0]); if (f && f.mode === 'path') { const q = toPx(f.x, f.y); ctx.fillStyle = '#ffffffcc'; ctx.beginPath(); ctx.moveTo(q.x - uu * 0.15, q.y - uu * 0.78); ctx.lineTo(q.x + uu * 0.15, q.y - uu * 0.78); ctx.lineTo(q.x, q.y - uu * 0.58); ctx.fill(); } }
      // particles
      particles = particles.filter((p) => (p.t += dt) < p.life);
      for (const p of particles) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.conf ? 1.5 : 14) * dt; if (p.rot != null) p.rot += dt * 5;
        const q = toPx(p.x, p.y); ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.translate(q.x, q.y); ctx.rotate(p.rot || p.t * 8); ctx.fillStyle = p.col;
        if (p.shard) { ctx.beginPath(); ctx.moveTo(0, -p.sz * uu); ctx.lineTo(p.sz * uu * 0.6, p.sz * uu * 0.5); ctx.lineTo(-p.sz * uu * 0.6, p.sz * uu * 0.4); ctx.fill(); }
        else ctx.fillRect(-p.sz * uu / 2, -p.sz * uu / 4, p.sz * uu, p.sz * uu / 2);
        ctx.restore();
      }
      popups = popups.filter((p) => (p.t += dt) < 1.1);
      for (const p of popups) {
        const q = toPx(p.x, p.y); const t = p.t; const s = t < 0.2 ? t / 0.2 * 1.15 : t < 0.3 ? 1.15 - (t - 0.2) * 1.5 : 1;
        ctx.save(); ctx.globalAlpha = t > 0.85 ? (1.1 - t) / 0.25 : 1; ctx.translate(q.x, q.y - t * uu * 0.6); ctx.scale(s, s);
        ctx.font = '900 ' + Math.round(uu * 1.3) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = uu * 0.25; ctx.strokeStyle = '#3b5fb8'; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = '#fff'; ctx.fillText(p.text, 0, 0); ctx.restore();
      }
      ctx.restore(); void u;
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', () => { resize(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) AU.stopMusic(); });

  // ---------- test hooks ----------
  window.__bp = {
    get S() { return S; }, get lv() { return lv; }, get save() { return save; },
    get busy() { return playing || queue.length > 0 || [...sprites.values()].some((s) => s.mode !== 'path' || s.moving); },
    get modal() { return modalOpen ? $('#m-title').textContent : null; },
    cellScreen(ci, pi) { const p = cellCenter(ci, pi, 0); const q = toPx(p.x + 0.5, p.y); const r = cv.getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; },
    start: startLevel, showMap, closeModal,
    unlock(n) { save.maxLevel = Math.max(save.maxLevel, n); persist(); },
  };
  resize();
  startLevel(Math.min(save.current, save.maxLevel));
  requestAnimationFrame(frame);
})();
