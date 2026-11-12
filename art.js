// Barnyard Parade: original vector art drawn on canvas (animals, crates, path props). Cached to sprites.
(function (root) {
  'use strict';
  const ANIMALS = {
    pig:        { name: 'Pig',         body: '#ff9fc2', dark: '#d9668f', light: '#ffd0e1' },
    chick:      { name: 'Chick',       body: '#ffd83a', dark: '#d9a400', light: '#fff09a' },
    sheep:      { name: 'Sheep',       body: '#ffffff', dark: '#b9c2cc', light: '#ffffff', face: '#f3d9bf' },
    frog:       { name: 'Frog',        body: '#6fd35a', dark: '#3c9a2f', light: '#b6f0a4' },
    duck:       { name: 'Duck',        body: '#5aa8f5', dark: '#2a6fc0', light: '#a9d4ff' },
    cow:        { name: 'Cow',         body: '#a8693b', dark: '#6e3f1e', light: '#d39a6a' },
    bunny:      { name: 'Bunny',       body: '#a9b1bd', dark: '#6f7885', light: '#dfe4ea' },
    hen:        { name: 'Hen',         body: '#ff8a2a', dark: '#c75a00', light: '#ffc18a' },
    blacksheep: { name: 'Black sheep', body: '#3b3f4a', dark: '#1d2027', light: '#6b7180', face: '#f1dcc6' },
    goat:       { name: 'Goat',        body: '#b48ae6', dark: '#7a52b3', light: '#dcc6fb' },
  };
  const TAU = Math.PI * 2;
  function circle(c, x, y, r, fill, stroke, lw) { c.beginPath(); c.arc(x, y, r, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
  function ellipse(c, x, y, rx, ry, rot, fill, stroke, lw) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
  function eyes(c, dx, y, r, blink) {
    for (const s of [-1, 1]) {
      if (blink) { c.beginPath(); c.moveTo(s * dx - r, y); c.quadraticCurveTo(s * dx, y + r * 0.9, s * dx + r, y); c.lineWidth = r * 0.55; c.strokeStyle = '#2a2230'; c.lineCap = 'round'; c.stroke(); continue; }
      circle(c, s * dx, y, r, '#2a2230');
      circle(c, s * dx + r * 0.35, y - r * 0.38, r * 0.38, '#fff');
    }
  }
  function blush(c, dx, y, r) { c.globalAlpha = 0.45; ellipse(c, -dx, y, r, r * 0.6, 0, '#ff6f91'); ellipse(c, dx, y, r, r * 0.6, 0, '#ff6f91'); c.globalAlpha = 1; }
  function smile(c, y, w, col) { c.beginPath(); c.moveTo(-w, y); c.quadraticCurveTo(0, y + w * 0.9, w, y); c.lineWidth = w * 0.35; c.lineCap = 'round'; c.strokeStyle = col || '#2a2230'; c.stroke(); }
  function gloss(c, r) { c.globalAlpha = 0.35; ellipse(c, -r * 0.35, -r * 0.5, r * 0.32, r * 0.18, -0.5, '#fff'); c.globalAlpha = 1; }
  function fluff(c, r, n, fill, stroke, lw) {
    c.beginPath();
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; c.moveTo(Math.cos(a) * r + r * 0.32, Math.sin(a) * r); c.arc(Math.cos(a) * r, Math.sin(a) * r, r * 0.32, 0, TAU); }
    c.fillStyle = fill; c.fill(); if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
    circle(c, 0, 0, r * 1.02, fill);
  }

  // Draw an animal centred at (0,0) with radius ~R (fits inside a cell of 2.2R)
  function drawAnimalRaw(c, kind, R, blink) {
    const A = ANIMALS[kind]; const lw = R * 0.09;
    c.lineJoin = 'round'; c.lineCap = 'round';
    switch (kind) {
      case 'pig': {
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * R * 0.35, -R * 0.75); c.lineTo(s * R * 0.92, -R * 1.0); c.lineTo(s * R * 0.8, -R * 0.35); c.closePath(); c.fillStyle = A.dark; c.fill(); }
        circle(c, 0, 0, R * 0.86, A.body, A.dark, lw); gloss(c, R);
        ellipse(c, 0, R * 0.22, R * 0.36, R * 0.26, 0, A.light, A.dark, lw * 0.8);
        ellipse(c, -R * 0.12, R * 0.22, R * 0.06, R * 0.1, 0, A.dark); ellipse(c, R * 0.12, R * 0.22, R * 0.06, R * 0.1, 0, A.dark);
        eyes(c, R * 0.34, -R * 0.2, R * 0.12, blink); blush(c, R * 0.55, R * 0.18, R * 0.14);
        break;
      }
      case 'chick': {
        c.beginPath(); for (const a of [-0.35, 0, 0.35]) { c.moveTo(0, -R * 0.75); c.quadraticCurveTo(Math.sin(a) * R * 0.6, -R * 1.25, Math.sin(a) * R * 0.25, -R * 1.05); } c.lineWidth = lw * 1.4; c.strokeStyle = A.dark; c.stroke();
        circle(c, 0, 0, R * 0.88, A.body, A.dark, lw); gloss(c, R);
        for (const s of [-1, 1]) ellipse(c, s * R * 0.8, R * 0.25, R * 0.18, R * 0.32, s * 0.5, A.light, A.dark, lw * 0.7);
        c.beginPath(); c.moveTo(-R * 0.16, R * 0.08); c.lineTo(R * 0.16, R * 0.08); c.lineTo(0, R * 0.34); c.closePath(); c.fillStyle = '#ff9a1f'; c.fill(); c.lineWidth = lw * 0.6; c.strokeStyle = '#c96a00'; c.stroke();
        eyes(c, R * 0.3, -R * 0.12, R * 0.12, blink); blush(c, R * 0.52, R * 0.22, R * 0.12);
        break;
      }
      case 'sheep': case 'blacksheep': {
        fluff(c, R * 0.72, 10, A.body, A.dark, lw);
        for (const s of [-1, 1]) ellipse(c, s * R * 0.62, -R * 0.02, R * 0.26, R * 0.13, s * 0.4, A.face, '#b08a6a', lw * 0.6);
        ellipse(c, 0, R * 0.1, R * 0.45, R * 0.52, 0, A.face, '#b08a6a', lw * 0.7);
        circle(c, 0, -R * 0.42, R * 0.24, A.body);
        circle(c, -R * 0.2, -R * 0.4, R * 0.17, A.body); circle(c, R * 0.2, -R * 0.4, R * 0.17, A.body);
        eyes(c, R * 0.18, R * 0.05, R * 0.1, blink);
        ellipse(c, 0, R * 0.32, R * 0.08, R * 0.05, 0, '#8a5a4a');
        blush(c, R * 0.3, R * 0.25, R * 0.09);
        break;
      }
      case 'frog': {
        for (const s of [-1, 1]) circle(c, s * R * 0.42, -R * 0.55, R * 0.3, A.body, A.dark, lw);
        ellipse(c, 0, R * 0.08, R * 0.92, R * 0.72, 0, A.body, A.dark, lw); gloss(c, R);
        for (const s of [-1, 1]) { circle(c, s * R * 0.42, -R * 0.55, R * 0.22, '#fff'); }
        if (blink) eyes(c, R * 0.42, -R * 0.55, R * 0.12, true);
        else for (const s of [-1, 1]) { circle(c, s * R * 0.42, -R * 0.53, R * 0.13, '#2a2230'); circle(c, s * R * 0.42 + R * 0.05, -R * 0.59, R * 0.05, '#fff'); }
        smile(c, R * 0.15, R * 0.38, '#2f6b26'); blush(c, R * 0.6, R * 0.15, R * 0.14);
        break;
      }
      case 'duck': {
        c.beginPath(); c.moveTo(0, -R * 0.8); c.quadraticCurveTo(R * 0.15, -R * 1.2, R * 0.35, -R * 1.0); c.lineWidth = lw * 1.4; c.strokeStyle = A.dark; c.stroke();
        circle(c, 0, 0, R * 0.86, A.body, A.dark, lw); gloss(c, R);
        ellipse(c, 0, R * 0.28, R * 0.42, R * 0.2, 0, '#ffb02e', '#c97800', lw * 0.7);
        c.beginPath(); c.moveTo(-R * 0.36, R * 0.28); c.quadraticCurveTo(0, R * 0.36, R * 0.36, R * 0.28); c.lineWidth = lw * 0.5; c.strokeStyle = '#c97800'; c.stroke();
        eyes(c, R * 0.32, -R * 0.18, R * 0.12, blink); blush(c, R * 0.58, R * 0.1, R * 0.12);
        break;
      }
      case 'cow': {
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * R * 0.35, -R * 0.62); c.quadraticCurveTo(s * R * 0.6, -R * 1.15, s * R * 0.25, -R * 1.05); c.lineWidth = R * 0.16; c.strokeStyle = '#f4e3b5'; c.stroke(); }
        for (const s of [-1, 1]) ellipse(c, s * R * 0.85, -R * 0.25, R * 0.28, R * 0.14, s * 0.35, A.dark);
        circle(c, 0, 0, R * 0.84, A.body, A.dark, lw); gloss(c, R);
        ellipse(c, -R * 0.35, -R * 0.4, R * 0.2, R * 0.15, 0.4, A.light);
        ellipse(c, 0, R * 0.32, R * 0.52, R * 0.36, 0, '#f6d6c2', '#c99a83', lw * 0.7);
        ellipse(c, -R * 0.18, R * 0.32, R * 0.07, R * 0.1, 0, '#a06a5a'); ellipse(c, R * 0.18, R * 0.32, R * 0.07, R * 0.1, 0, '#a06a5a');
        eyes(c, R * 0.33, -R * 0.15, R * 0.12, blink);
        break;
      }
      case 'bunny': {
        for (const s of [-1, 1]) { ellipse(c, s * R * 0.32, -R * 0.95, R * 0.2, R * 0.55, s * 0.12, A.body, A.dark, lw); ellipse(c, s * R * 0.32, -R * 0.92, R * 0.09, R * 0.38, s * 0.12, '#ffb6cb'); }
        circle(c, 0, R * 0.05, R * 0.8, A.body, A.dark, lw); gloss(c, R);
        ellipse(c, 0, R * 0.28, R * 0.3, R * 0.2, 0, A.light);
        ellipse(c, 0, R * 0.18, R * 0.09, R * 0.06, 0, '#ff7fa4');
        c.beginPath(); for (const s of [-1, 1]) for (const d of [-0.06, 0.06]) { c.moveTo(s * R * 0.22, R * 0.26 + d * R); c.lineTo(s * R * 0.62, R * 0.2 + d * R * 2.2); } c.lineWidth = lw * 0.4; c.strokeStyle = '#6f7885'; c.stroke();
        eyes(c, R * 0.3, -R * 0.1, R * 0.12, blink); blush(c, R * 0.5, R * 0.18, R * 0.12);
        break;
      }
      case 'hen': {
        c.beginPath(); c.arc(-R * 0.22, -R * 0.82, R * 0.18, 0, TAU); c.arc(0, -R * 0.92, R * 0.2, 0, TAU); c.arc(R * 0.22, -R * 0.82, R * 0.18, 0, TAU); c.fillStyle = '#ff3b4a'; c.fill();
        circle(c, 0, 0, R * 0.86, A.body, A.dark, lw); gloss(c, R);
        c.beginPath(); c.moveTo(-R * 0.15, R * 0.05); c.lineTo(R * 0.15, R * 0.05); c.lineTo(0, R * 0.3); c.closePath(); c.fillStyle = '#ffd23a'; c.fill(); c.lineWidth = lw * 0.6; c.strokeStyle = '#c98f00'; c.stroke();
        ellipse(c, 0, R * 0.42, R * 0.08, R * 0.13, 0, '#ff3b4a');
        eyes(c, R * 0.32, -R * 0.18, R * 0.12, blink); blush(c, R * 0.55, R * 0.15, R * 0.12);
        break;
      }
      case 'goat': {
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * R * 0.25, -R * 0.65); c.quadraticCurveTo(s * R * 0.95, -R * 1.3, s * R * 0.85, -R * 0.55); c.lineWidth = R * 0.17; c.strokeStyle = '#8f7a6a'; c.stroke(); }
        for (const s of [-1, 1]) ellipse(c, s * R * 0.85, -R * 0.15, R * 0.3, R * 0.13, s * 0.5, A.dark);
        ellipse(c, 0, 0, R * 0.74, R * 0.86, 0, A.body, A.dark, lw); gloss(c, R);
        c.beginPath(); c.moveTo(-R * 0.16, R * 0.7); c.quadraticCurveTo(0, R * 1.2, R * 0.16, R * 0.7); c.closePath(); c.fillStyle = '#f5ecff'; c.fill(); c.lineWidth = lw * 0.6; c.strokeStyle = A.dark; c.stroke();
        ellipse(c, 0, R * 0.36, R * 0.32, R * 0.22, 0, A.light);
        ellipse(c, -R * 0.1, R * 0.33, R * 0.05, R * 0.07, 0, A.dark); ellipse(c, R * 0.1, R * 0.33, R * 0.05, R * 0.07, 0, A.dark);
        eyes(c, R * 0.3, -R * 0.15, R * 0.12, blink);
        break;
      }
    }
  }
  const spriteCache = {};
  function sprite(kind, px, blink) {
    const key = kind + ':' + px + ':' + (blink ? 1 : 0);
    if (spriteCache[key]) return spriteCache[key];
    const cv = document.createElement('canvas'); const size = Math.ceil(px * 1.5);
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    c.translate(size / 2, size / 2 + px * 0.06);
    // soft shadow
    c.globalAlpha = 0.18; ellipse(c, 0, px * 0.4, px * 0.38, px * 0.1, 0, '#000'); c.globalAlpha = 1;
    drawAnimalRaw(c, kind, px * 0.42, blink);
    spriteCache[key] = cv; return cv;
  }
  // Draw animal centred at (x,y) where `px` is the cell size in device pixels.
  const kname = (k) => (typeof k === 'number' ? root.BPGame.KINDS[k] : k);
  function drawAnimal(c, kind, x, y, px, opt) {
    opt = opt || {}; kind = kname(kind);
    const cpx = Math.max(8, Math.round(px));
    const sp = sprite(kind, cpx, opt.blink);
    const sc = (opt.scale || 1) * px / cpx;
    const w = sp.width * sc;
    c.save(); c.translate(x, y);
    if (opt.rot) c.rotate(opt.rot);
    if (opt.squash) c.scale(1 + opt.squash, 1 - opt.squash);
    if (opt.alpha != null) c.globalAlpha = opt.alpha;
    c.drawImage(sp, -w / 2, -w / 2, w, w);
    c.restore();
  }
  root.BPArt = { kname, ANIMALS, drawAnimal, drawAnimalRaw, sprite };
})(this);
