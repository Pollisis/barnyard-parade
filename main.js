// Barnyard Parade v2: rendering, animation, input, HUD, dialogs, saving.
(function () {
  'use strict';
  const G = window.BPGame, ART = window.BPArt, AU = window.BPAudio, CF = window.BP_CONFIG, C = CF.CONFIG;
  const $ = (s) => document.querySelector(s);
  document.title = CF.GAME_NAME;
  document.querySelectorAll('[data-name]').forEach((e) => { e.textContent = CF.GAME_NAME; });
  const PW = ['redo', 'shuffle', 'plus2', 'magnet', 'barn'];
  const PW_NAME = { redo: 'Redo', shuffle: 'Shuffle', plus2: '+2 Track', magnet: 'Magnet', barn: 'Extra barn' };

  // ---------- save data ----------
  const KEY = 'barnyard-parade.save.v2';
  function defaults() { return { maxLevel: 1, current: 1, stars: {}, cleared: {}, bank: Object.assign({}, C.START_BANK), settings: { music: 0.5, sfx: 0.8, muted: false }, seenHelp: false }; }
  let save;
  try { save = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { save = defaults(); }
  try { const old = JSON.parse(localStorage.getItem('barnyard-parade.save.v1') || 'null'); if (old && old.settings && !localStorage.getItem(KEY)) save.settings = old.settings; } catch (e) { /* ignore */ }
  for (const k of PW) if (typeof save.bank[k] !== 'number') save.bank[k] = C.START_BANK[k] || 0;
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
  AU.set(save.settings);

  // level cache (generation is deterministic; caching just saves time on slower phones)
  function loadLevel(n) {
    const ck = 'barnyard-parade.lv.' + CF.VERSION + '.' + n;
    try {
      const raw = localStorage.getItem(ck);
      if (raw) { const lv = JSON.parse(raw); lv.layout = G.makeLayout(lv.board.cells.length); return lv; }
    } catch (e) { /* ignore */ }
    const lv = G.generateLevel(n);
    try { const { layout, ...rest } = lv; localStorage.setItem(ck, JSON.stringify(rest)); localStorage.removeItem('barnyard-parade.lv.' + CF.VERSION + '.' + (n - 6)); } catch (e) { /* ignore */ }
    return lv;
  }

  // ---------- state ----------
  const cv = $('#board'), ctx = cv.getContext('2d');
  let lv = null, S = null, lay = null;
  const view = { u: 30, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  let disp = new Map();       // animal id -> {x,y,rot,phase,puff}
  let puffs = [], particles = [], popups = [], flyers = [];
  let flips = {}, fences = {}, taps = {};
  let modalOpen = false, time = 0, stepTimer = 0, wasZoom = false, ended = false, speed = 1, parkSnd = 0;

  // ---------- geometry ----------
  function barnRect(B) { return B.temp ? lay.temps[B.tempIndex] : lay.barns[B.id]; }
  function cellPos(B, j) {
    const r = barnRect(B), row = Math.floor(j / 2), col = j % 2;
    const x = r.x + 0.15 + col + 0.5;
    if (r.side === 'top') return { x, y: r.y + 0.175 + row + 0.5, rot: Math.PI };
    return { x, y: r.y + r.h - 0.175 - row - 0.5, rot: 0 };
  }
  function doorPos(B, i) { const r = barnRect(B); const cx = r.x + r.w / 2 + (i % 2 ? 0.25 : -0.25); return r.side === 'top' ? { x: cx, y: r.y + r.h + 0.3, rot: Math.PI } : { x: cx, y: r.y - 0.3, rot: 0 }; }
  const toPx = (x, y) => ({ x: view.ox + x * view.u, y: view.oy + y * view.u });
  function resize() {
    const r = cv.getBoundingClientRect();
    view.dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * view.dpr); cv.height = Math.round(r.height * view.dpr);
    view.w = r.width; view.h = r.height;
    if (!lay) return;
    view.u = Math.min(r.width / (lay.W + 0.1), r.height / (lay.H + 0.1));
    view.ox = (r.width - lay.W * view.u) / 2; view.oy = Math.max(0, (r.height - lay.H * view.u) / 2);
    placeSign();
  }
  function placeSign() { const p = toPx(lay.sign.x, lay.sign.y); const e = $('#cap'); e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; }

  // ---------- level flow ----------
  function startLevel(n) {
    n = Math.max(1, Math.min(n, save.maxLevel));
    save.current = n; persist();
    $('#loading').classList.remove('hidden'); $('#ld-fill').style.width = '60%';
    $('#lvl-text').textContent = 'Level ' + n;
    setTimeout(() => {
      lv = loadLevel(n); lay = lv.layout; S = G.newGame(lv);
      disp = new Map(); puffs = []; particles = []; popups = []; flyers = []; flips = {}; fences = {}; taps = {};
      for (const B of S.barns) if (B.cleared) fences[B.id] = -10;
      ended = false; wasZoom = false;
      resize(); hud();
      $('#loading').classList.add('hidden');
      if (!save.seenHelp) setTimeout(showHelp, 250);
      setHint(n <= 2 ? 'Tap a barn to send its front animals on parade. They park next to a matching animal. Fill a barn with 16 of one kind!' : null);
      setTimeout(() => { try { loadLevel(n + 1); } catch (e) { /* ignore */ } }, 1500);
    }, 30);
  }
  function hud() {
    const n = S ? G.trackCount(S) : 0, cap = S ? S.cap : C.TRACK_CAPACITY;
    const t = n + '/' + cap; const el = $('#cap-text');
    if (el.textContent !== t) { el.textContent = t; const c = $('#cap'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 140); }
    $('#cap').classList.toggle('full', n >= cap);
    document.querySelectorAll('.pw').forEach((b) => { const k = b.dataset.pw; b.querySelector('.cnt').textContent = save.bank[k] || 0; b.classList.toggle('empty', !(save.bank[k] > 0)); });
  }
  function setHint(t) { const h = $('#hint'); if (!t) { h.classList.add('hidden'); return; } h.textContent = t; h.classList.remove('hidden'); }
  let toastT = 0;
  function toast(t, ms) { const e = $('#toast'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.add('hidden'), ms || 1800); }
  const kindName = (k) => ART.KINDS[k];
  const plural = (k) => ART.INFO[kindName(k)].plural;

  // ---------- events from the simulation ----------
  function handle(evs) {
    const now = time;
    for (const e of evs) {
      switch (e.type) {
        case 'park': if (now - parkSnd > 0.07) { AU.fx.park(); parkSnd = now; } break;
        case 'reveal': flips[e.id] = now; AU.fx.pop(); break;
        case 'clear': {
          AU.fx.chime(); AU.fx.fence(); fences[e.barn] = now;
          const r = barnRect(S.barns[e.barn]);
          popups.push({ text: 'Great!', x: r.x + r.w / 2, y: r.side === 'top' ? r.y + r.h - 1.5 : r.y + 1.5, t: 0 });
          for (let i = 0; i < 24; i++) particles.push({ x: r.x + Math.random() * r.w, y: r.y + Math.random() * r.h, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, life: 1.1, t: 0, col: ['#ffe36b', '#fff', '#ffc21a'][i % 3], sz: 0.12 + Math.random() * 0.12, star: true });
          break;
        }
        case 'unclear': delete fences[e.barn]; break;
        case 'won': ended = true; setTimeout(showWin, 700); break;
        case 'lost': ended = true; setTimeout(showLost, 500); break;
      }
    }
  }

  // ---------- input ----------
  function pickBarn(x, y) {
    for (const B of S.barns) { const r = barnRect(B); if (x >= r.x - 0.12 && x <= r.x + r.w + 0.12 && y >= r.y - 0.2 && y <= r.y + r.h + 0.2) return B; }
    return null;
  }
  cv.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); AU.ensure(); if (!AU.playing) AU.startMusic();
    if (!S || modalOpen) return;
    const rc = cv.getBoundingClientRect(); const x = (ev.clientX - rc.left - view.ox) / view.u, y = (ev.clientY - rc.top - view.oy) / view.u;
    const B = pickBarn(x, y);
    if (!B) {
      for (const a of S.track) { const d = disp.get(a.id); if (d && Math.hypot(d.x - x, d.y - y) < 0.7) { AU.fx.animal(a.k); d.squash = time; return; } }
      return;
    }
    if (S.status !== 'play') { if (S.status === 'lost') showLost(); return; }
    taps[B.id] = time;
    const res = G.tap(S, B.id);
    if (!res.ok) {
      AU.fx.nope();
      if (res.why === 'full') toast('The parade is full! Wait for a spot, or use +2 Track.');
      else if (res.why === 'empty') toast(B.temp ? 'This extra barn is empty' : 'This barn is empty');
      return;
    }
    setHint(null);
    AU.fx.animal(res.k); AU.fx.hop();
    for (const ev2 of res.events) for (const a of (ev2.animals || [])) if (a.wasMystery) flips[a.id] = time;
    handle(res.events);
    if (res.split) toast('Only ' + res.n + ' fit on the track right now', 1400);
    hud();
  });

  // ---------- power-ups ----------
  function usePower(k) {
    AU.ensure();
    if (!S) return;
    if (modalOpen) closeModal();
    if (S.status === 'won') return;
    if (!(save.bank[k] > 0)) { AU.fx.nope(); toast('No ' + PW_NAME[k] + ' left. Clear levels to earn more (they are free)!', 2200); return; }
    let ok = false;
    if (k === 'redo') { ok = G.redo(S); if (!ok) toast('Nothing to put back yet'); else { toast('Back where they were'); fences = {}; for (const B of S.barns) if (B.cleared) fences[B.id] = -10; } }
    else if (k === 'shuffle') { ok = G.shuffleColors(S); if (!ok) toast('Nothing to shuffle'); else toast('Shuffled!'); }
    else if (k === 'plus2') { ok = G.plus2(S); if (!ok) toast('The track is as long as it gets'); else popups.push({ text: '+2 on the track!', x: lay.W / 2, y: (lay.yT + lay.yB) / 2, t: 0 }); }
    else if (k === 'magnet') {
      const before = new Map(); for (const [id, d] of disp) before.set(id, { x: d.x, y: d.y, rot: d.rot });
      const res = G.magnet(S);
      ok = !!res;
      if (res) {
        AU.fx.magnet(); toast('The magnet took all the ' + plural(res.k) + '!', 2200);
        res.gone.forEach((g, i) => { const d = before.get(g.id); if (d) flyers.push({ k: res.k, fx: d.x, fy: d.y, tx: lay.W / 2, ty: -1, t0: time + i * 0.02, dur: 0.7 }); disp.delete(g.id); });
      } else toast('Nothing left for the magnet');
    } else if (k === 'barn') { const B = G.addTempBarn(S); ok = !!B; if (!B) toast('Only ' + C.TEMP_BARN_MAX + ' extra barns fit'); else popups.push({ text: 'Extra barn!', x: lay.temps[B.tempIndex].x + 1.1, y: lay.temps[B.tempIndex].y + 0.8, t: 0 }); }
    if (ok) { save.bank[k]--; persist(); AU.fx.power(); ended = false; hud(); }
  }
  document.querySelectorAll('.pw').forEach((b) => b.addEventListener('click', () => usePower(b.dataset.pw)));
  $('#btn-restart').addEventListener('click', () => { AU.fx.click(); if (modalOpen) closeModal(); if (save.current) startLevel(save.current); });
  $('#btn-settings').addEventListener('click', () => { AU.fx.click(); showSettings(); });

  // ---------- dialogs ----------
  function modal(title, body, buttons) {
    modalOpen = true; $('#m-title').textContent = title; $('#m-body').innerHTML = body;
    const bw = $('#m-buttons'); bw.innerHTML = '';
    for (const b of buttons) { const e = document.createElement('button'); e.className = 'btn ' + (b.cls || ''); e.textContent = b.label; if (b.id) e.id = b.id; e.onclick = () => { AU.fx.click(); b.fn(); }; bw.appendChild(e); }
    $('#modal').classList.remove('hidden');
  }
  function closeModal() { modalOpen = false; $('#modal').classList.add('hidden'); }
  function showWin() {
    if (modalOpen || !S || S.status !== 'won') return;
    const n = S.level, stars = G.starsFor(S);
    AU.fx.win(); confetti();
    let rewardHtml = '';
    if (!save.cleared[n]) {
      const rw = G.rewardFor(n); save.cleared[n] = 1;
      for (const k of Object.keys(rw)) save.bank[k] = Math.min(C.BANK_MAX, (save.bank[k] || 0) + rw[k]);
      rewardHtml = '<p>Free power-ups saved for later:</p>' + Object.keys(rw).map((k) => '<span class="reward">+' + rw[k] + ' ' + PW_NAME[k] + '</span>').join('');
    }
    save.stars[n] = Math.max(save.stars[n] || 0, stars);
    save.maxLevel = Math.max(save.maxLevel, n + 1); save.current = n + 1; persist(); hud();
    const st = [1, 2, 3].map((i) => '<span class="' + (i <= stars ? 'on' : 'off') + '" style="animation-delay:' + (i * 0.15) + 's">★</span>').join('');
    modal('Level ' + n + ' complete!', '<div class="stars">' + st + '</div><p>' + (stars === 3 ? 'Every barn sorted, no power-ups needed!' : 'Every barn sorted!') + '</p>' + rewardHtml,
      [{ label: 'Map', cls: 'blue', fn: () => { closeModal(); showMap(); } }, { label: 'Next level', id: 'btn-next', fn: () => { closeModal(); startLevel(n + 1); } }]);
  }
  function showLost() {
    if (modalOpen || !S || S.status !== 'lost') return;
    AU.fx.lose();
    const b = save.bank, btns = [];
    if (b.redo > 0 && S.history.length) btns.push({ label: 'Redo (' + b.redo + ')', cls: 'blue', fn: () => { closeModal(); usePower('redo'); } });
    if (b.plus2 > 0) btns.push({ label: '+2 Track (' + b.plus2 + ')', cls: 'orange', fn: () => { closeModal(); usePower('plus2'); } });
    if (b.barn > 0 && S.barns.filter((B) => B.temp).length < C.TEMP_BARN_MAX) btns.push({ label: 'Extra barn (' + b.barn + ')', cls: 'orange', fn: () => { closeModal(); usePower('barn'); } });
    if (b.magnet > 0) btns.push({ label: 'Magnet (' + b.magnet + ')', cls: 'orange', fn: () => { closeModal(); usePower('magnet'); } });
    btns.push({ label: 'Retry', id: 'btn-retry', fn: () => { closeModal(); startLevel(S.level); } });
    modal('Out of room!', '<p>The parade is full and nobody has a barn to park in.</p><p>Every level can be won without power-ups. Try again, or use one you saved.</p>', btns);
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
    modal('How to play', '<p><b>Tap a barn</b> to send its front animals out. A matching group leaves together (4 ducks in a row = 4 ducks).</p>' +
      '<p>They <b>parade around the loop</b> and park by themselves next to a matching animal, or in an empty barn.</p>' +
      '<p>Fill a barn with <b>16 of one animal</b> and a fence closes it. Sort every barn to win!</p>' +
      '<p>The sign shows how many are parading (x/16). If it is full and nobody can park, the level is over. <b>?</b> boxes are a surprise until they leave. A colored barn only takes that animal.</p>' +
      '<p>Power-ups are free, earned by playing, and saved between levels.</p>',
    [{ label: "Let's play!", fn: closeModal }]);
  }
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
    $('#map-bank').textContent = PW.map((k) => PW_NAME[k] + ' ' + save.bank[k]).join(' · ');
    $('#map-play').textContent = 'Play level ' + Math.min(save.current, save.maxLevel);
    $('#map').classList.remove('hidden');
    const cur = posOf(Math.min(save.current, save.maxLevel)); $('#map-scroll').scrollTop = cur.y - window.innerHeight / 2;
  }
  $('#map-close').onclick = () => { AU.fx.click(); $('#map').classList.add('hidden'); };
  $('#map-play').onclick = () => { AU.fx.click(); $('#map').classList.add('hidden'); startLevel(Math.min(save.current, save.maxLevel)); };
  function confetti() {
    const cols = ['#ff6f91', '#ffd83a', '#5aa8f5', '#6fd35a', '#ff8a2a', '#b48ae6'];
    for (let i = 0; i < 110; i++) particles.push({ x: Math.random() * lay.W, y: -0.5 - Math.random() * 4, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 2, life: 3.2, t: 0, col: cols[i % cols.length], sz: 0.2 + Math.random() * 0.15, rot: Math.random() * 6, conf: true });
  }

  // ---------- drawing ----------
  const rr = ART.rr;
  function drawGround(c) {
    const u = view.u;
    const gp = ART.pattern(c, 'grass', u * view.dpr, 7);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    if (gp) { c.fillStyle = gp; c.fillRect(0, 0, cv.width, cv.height); } else { c.fillStyle = '#7cc95a'; c.fillRect(0, 0, cv.width, cv.height); }
    const vg = c.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.2, cv.width / 2, cv.height / 2, cv.height * 0.75); vg.addColorStop(0, 'rgba(255,255,230,0.10)'); vg.addColorStop(1, 'rgba(20,60,10,0.25)');
    c.fillStyle = vg; c.fillRect(0, 0, cv.width, cv.height);
    c.restore();
  }
  function tracePath(c) { c.beginPath(); lay.pts.forEach((p, i) => { const q = toPx(p.x, p.y); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); c.closePath(); }
  function drawTrack(c) {
    const u = view.u;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    tracePath(c); c.strokeStyle = 'rgba(60,40,10,0.35)'; c.lineWidth = u * 1.32; c.stroke();
    tracePath(c); c.strokeStyle = '#b98d55'; c.lineWidth = u * 1.2; c.stroke();
    const dp = ART.pattern(c, 'dirt', u, 5);
    tracePath(c); c.strokeStyle = dp || '#e9cf9a'; c.lineWidth = u * 1.06; c.stroke();
    tracePath(c); c.strokeStyle = 'rgba(255,240,200,0.18)'; c.lineWidth = u * 0.5; c.stroke();
    c.restore();
  }
  function drawBarn(c, B) {
    const u = view.u, r = barnRect(B), P = toPx(r.x, r.y), w = r.w * u, h = r.h * u;
    const tp = taps[B.id] != null && time - taps[B.id] < 0.18 ? 1 - (time - taps[B.id]) / 0.18 : 0;
    c.save();
    c.translate(P.x + w / 2, P.y + h / 2); c.scale(1 + tp * 0.03, 1 + tp * 0.015); c.translate(-w / 2, -h / 2);
    c.fillStyle = 'rgba(30,20,5,0.35)'; rr(c, u * 0.08, u * 0.12, w, h, u * 0.2); c.fill();
    // frame
    const fg = c.createLinearGradient(0, 0, w, 0); fg.addColorStop(0, '#8a5427'); fg.addColorStop(0.5, '#b07035'); fg.addColorStop(1, '#7c4a20');
    c.fillStyle = fg; rr(c, 0, 0, w, h, u * 0.2); c.fill();
    if (B.preset != null) { c.strokeStyle = ART.INFO[kindName(B.preset)].color; c.lineWidth = u * 0.14; rr(c, u * 0.03, u * 0.03, w - u * 0.06, h - u * 0.06, u * 0.18); c.stroke(); }
    // plank floor
    const wp = ART.pattern(c, 'wood', u, 4);
    c.fillStyle = wp || '#9a6a3a'; rr(c, u * 0.12, u * 0.12, w - u * 0.24, h - u * 0.24, u * 0.1); c.fill();
    if (B.preset != null) { c.fillStyle = ART.INFO[kindName(B.preset)].color; c.globalAlpha = 0.22; rr(c, u * 0.12, u * 0.12, w - u * 0.24, h - u * 0.24, u * 0.1); c.fill(); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(u * 0.12, r.side === 'top' ? u * 0.12 : h - u * 0.2, w - u * 0.24, u * 0.08);
    // open-end lip (where animals come and go)
    c.fillStyle = 'rgba(255,230,170,0.35)'; c.fillRect(u * 0.12, r.side === 'top' ? h - u * 0.16 : u * 0.08, w - u * 0.24, u * 0.06);
    // rail posts
    c.fillStyle = '#6a3d18'; for (const [px, py] of [[0, 0], [w - u * 0.22, 0], [0, h - u * 0.22], [w - u * 0.22, h - u * 0.22]]) { rr(c, px, py, u * 0.22, u * 0.22, u * 0.05); c.fill(); }
    if (B.temp) { c.fillStyle = '#fff'; c.font = '900 ' + Math.round(u * 0.34) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+4', w / 2, h + u * 0.25); }
    c.restore();
    // preset badge on the closed end
    if (B.preset != null) {
      const bx = P.x + w / 2, by = r.side === 'top' ? P.y + u * 0.05 : P.y + h - u * 0.05;
      c.save(); c.beginPath(); c.arc(bx, by, u * 0.42, 0, Math.PI * 2); c.fillStyle = '#fff8e8'; c.fill(); c.lineWidth = u * 0.1; c.strokeStyle = ART.INFO[kindName(B.preset)].color; c.stroke(); c.restore();
      ART.drawAnimal(c, B.preset, bx, by, u * 0.62, 0, { dpr: view.dpr });
    }
  }
  function drawFence(c, B) {
    const t0 = fences[B.id]; if (t0 == null) return;
    const u = view.u, r = barnRect(B), im = ART.img.fence;
    const fw = r.w * 1.08 * u, fh = im ? fw * im.height / im.width : u * 0.7;
    const k = Math.min(1, (time - t0) / 0.45); const e = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 6) : 1;
    const drop = (1 - e) * u * 1.6;
    const cx = toPx(r.x + r.w / 2, 0).x;
    const yEdge = r.side === 'top' ? toPx(0, r.y + r.h).y : toPx(0, r.y).y;
    c.save(); c.globalAlpha = Math.min(1, k * 3);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(cx, yEdge + fh * 0.35, fw * 0.48, fh * 0.18, 0, 0, Math.PI * 2); c.fill();
    if (im) c.drawImage(im, cx - fw / 2, yEdge - fh * 0.62 - drop, fw, fh);
    c.restore();
  }
  function stepDisplay(dt) {
    const seen = new Set();
    const rate = (r) => 1 - Math.exp(-r * dt);
    const upd = (a, tx, ty, trot, r) => {
      let d = disp.get(a.id);
      if (!d) { d = { x: tx, y: ty, rot: trot, phase: Math.random() * 6, puff: Math.random() * 0.2 }; disp.set(a.id, d); }
      const k = rate(r); d.x += (tx - d.x) * k; d.y += (ty - d.y) * k;
      let dr = trot - d.rot; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2; d.rot += dr * rate(r * 0.8);
      seen.add(a.id); return d;
    };
    for (const B of S.barns) { B.cells.forEach((a, j) => { const p = cellPos(B, j); const d = upd(a, p.x, p.y, p.rot, 14); d.mode = 'barn'; }); B.queue.forEach((a, i) => { const p = doorPos(B, i); const d = upd(a, p.x, p.y, p.rot, 12); d.mode = 'queue'; }); }
    for (const a of S.track) {
      const p = G.pointAt(lay, a.s); const d = upd(a, p.x, p.y, p.ang + Math.PI / 2, 22); d.mode = 'track';
      d.puff -= dt; if (d.puff <= 0) { d.puff = S.zoom ? 0.08 : 0.2; if (puffs.length < 220) puffs.push({ x: d.x - Math.cos(p.ang) * 0.48 + (Math.random() - 0.5) * 0.1, y: d.y - Math.sin(p.ang) * 0.48 + (Math.random() - 0.5) * 0.1, t: 0, life: 0.75, r0: 0.08 }); }
    }
    for (const id of [...disp.keys()]) if (!seen.has(id)) disp.delete(id);
  }
  function drawAnimals(c, which) {
    const u = view.u;
    const list = [];
    for (const B of S.barns) { if (which === 'barn') B.cells.forEach((a) => list.push(a)); else B.queue.forEach((a) => list.push(a)); }
    if (which === 'track') for (const a of S.track) list.push(a);
    for (const a of list) {
      const d = disp.get(a.id); if (!d) continue;
      const q = toPx(d.x, d.y);
      const fl = flips[a.id]; const ft = fl != null ? (time - fl) / 0.3 : 2;
      if (a.mystery || ft < 0.5) { ART.drawMystery(c, q.x, q.y, u, a.mystery ? 1 : Math.max(0, 1 - ft * 2)); if (a.mystery) continue; }
      let rot = d.rot, sx = 0, sc = 1;
      if (d.mode === 'track') { rot += Math.sin(time * (S.zoom ? 26 : 13) + d.phase) * 0.16; sx = Math.sin(time * 13 + d.phase) * 0.05; }
      if (ft < 1) sc = Math.max(0.01, (ft - 0.5) * 2);
      if (d.squash != null && time - d.squash < 0.25) sx += Math.sin((time - d.squash) / 0.25 * Math.PI) * 0.2;
      ART.drawAnimal(c, a.k, q.x, q.y, u * 0.98, rot, { dpr: view.dpr, sx, scale: sc });
    }
  }
  function frame(tms) {
    const now = tms / 1000; const rdt = Math.min(0.05, now - (time || now)); time = now;
    if (S && lay) {
      if (!modalOpen || S.status !== 'play') {
        let left = rdt * speed;
        while (left > 1e-6) { const dt = Math.min(0.03, left); left -= dt; handle(G.step(S, dt)); }
      }
      if (S.zoom && !wasZoom) { AU.fx.zoom(); popups.push({ text: 'Home stretch!', x: lay.W / 2, y: (lay.yT + lay.yB) / 2, t: 0 }); }
      wasZoom = S.zoom;
      stepTimer -= rdt; if (S.track.length && stepTimer <= 0) { AU.fx.step(S.track.length); stepTimer = S.zoom ? 0.12 : 0.26; }
      stepDisplay(rdt);
      hud();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      drawGround(ctx);
      drawTrack(ctx);
      for (const B of S.barns) drawBarn(ctx, B);
      drawAnimals(ctx, 'barn');
      for (const B of S.barns) drawFence(ctx, B);
      // exhaust puffs under the parade
      const u = view.u;
      puffs = puffs.filter((p) => (p.t += rdt) < p.life);
      for (const p of puffs) { const k = p.t / p.life; const q = toPx(p.x, p.y); ctx.globalAlpha = 0.45 * (1 - k); ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(q.x, q.y, (p.r0 + k * 0.22) * u, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      drawAnimals(ctx, 'queue'); drawAnimals(ctx, 'track');
      // magnet flyers
      flyers = flyers.filter((f) => time - f.t0 < f.dur);
      for (const f of flyers) { const t = Math.max(0, (time - f.t0) / f.dur); const e = t * t; const q = toPx(f.fx + (f.tx - f.fx) * e, f.fy + (f.ty - f.fy) * e); ART.drawAnimal(ctx, f.k, q.x, q.y, u, t * 8, { dpr: view.dpr, scale: 1 - t * 0.7 }); }
      particles = particles.filter((p) => (p.t += rdt) < p.life);
      for (const p of particles) {
        p.x += p.vx * rdt; p.y += p.vy * rdt; p.vy += (p.conf ? 1.5 : 6) * rdt; if (p.rot != null) p.rot += rdt * 5;
        const q = toPx(p.x, p.y); ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.translate(q.x, q.y); ctx.rotate(p.rot || p.t * 6); ctx.fillStyle = p.col;
        if (p.star) { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.57; ctx.lineTo(Math.cos(a) * p.sz * u, Math.sin(a) * p.sz * u); const b = a + 0.628; ctx.lineTo(Math.cos(b) * p.sz * u * 0.45, Math.sin(b) * p.sz * u * 0.45); } ctx.fill(); }
        else ctx.fillRect(-p.sz * u / 2, -p.sz * u / 4, p.sz * u, p.sz * u / 2);
        ctx.restore();
      }
      popups = popups.filter((p) => (p.t += rdt) < 1.2);
      for (const p of popups) {
        const q = toPx(p.x, p.y); const t = p.t; const s = t < 0.2 ? t / 0.2 * 1.15 : t < 0.3 ? 1.15 - (t - 0.2) * 1.5 : 1;
        ctx.save(); ctx.globalAlpha = t > 0.9 ? (1.2 - t) / 0.3 : 1; ctx.translate(q.x, q.y - t * u * 0.6); ctx.scale(s, s);
        ctx.font = '900 ' + Math.round(u * 1.0) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = u * 0.22; ctx.strokeStyle = '#3b5fb8'; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = '#fff'; ctx.fillText(p.text, 0, 0); ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) AU.stopMusic(); });

  // ---------- test hooks ----------
  window.__bp = {
    get S() { return S; }, get lv() { return lv; }, get save() { return save; },
    get modal() { return modalOpen ? $('#m-title').textContent : null; },
    get loading() { return !$('#loading').classList.contains('hidden'); },
    get settled() { return !!S && !S.barns.some((B) => B.queue.length) && (!S.track.length || !G.anyParkable(S)); },
    set speed(v) { speed = v; }, get speed() { return speed; },
    barnScreen(b) { const B = S.barns[b]; const r = barnRect(B); const q = toPx(r.x + r.w / 2, r.y + r.h / 2); const rc = cv.getBoundingClientRect(); return { x: rc.left + q.x, y: rc.top + q.y }; },
    start: startLevel, showMap, closeModal, usePower,
    custom(level, cap) { lv = level; lay = lv.layout; S = G.newGame(lv); if (cap) S.cap = cap; disp = new Map(); puffs = []; flips = {}; fences = {}; ended = false; resize(); hud(); },
    unlock(n) { save.maxLevel = Math.max(save.maxLevel, n); persist(); },
  };
  ART.load((f) => { $('#ld-fill').style.width = Math.round(f * 50) + '%'; }).then(() => { resize(); startLevel(Math.min(save.current, save.maxLevel)); });
  requestAnimationFrame(frame);
})();
