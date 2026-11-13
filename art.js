// Barnyard Parade: loads the generated top-down sprites and textures, and draws barn props on canvas.
(function (root) {
  'use strict';
  const V = (root.BP_CONFIG && root.BP_CONFIG.VERSION) || 1;
  const KINDS = ['pig', 'chick', 'sheep', 'frog', 'duck', 'cow', 'bunny', 'hen', 'blacksheep', 'goat'];
  const INFO = {
    pig: { name: 'Pig', plural: 'pigs', color: '#ff9fc2' }, chick: { name: 'Chick', plural: 'chicks', color: '#ffd83a' },
    sheep: { name: 'Sheep', plural: 'sheep', color: '#f4f1e8' }, frog: { name: 'Frog', plural: 'frogs', color: '#6fd35a' },
    duck: { name: 'Duck', plural: 'ducks', color: '#78bdf5' }, cow: { name: 'Cow', plural: 'cows', color: '#8a5230' },
    bunny: { name: 'Bunny', plural: 'bunnies', color: '#9aa1ab' }, hen: { name: 'Hen', plural: 'hens', color: '#ff8a2a' },
    blacksheep: { name: 'Black sheep', plural: 'black sheep', color: '#3a3d44' }, goat: { name: 'Goat', plural: 'goats', color: '#b48ae6' },
  };
  // floor colors for color-locked barns: the animal's color, deep enough to stand out from plain wood
  const FLOOR = { pig: '#e8588f', chick: '#e9ab00', sheep: '#e9dfc2', frog: '#35a032', duck: '#2f86d6', cow: '#3a1a0b', bunny: '#6f7a88', hen: '#e05a12', blacksheep: '#24262c', goat: '#8a5ad0' };
  const SCENERY = ['tree', 'pond', 'garden', 'bush', 'hay', 'flowers'];
  const img = {};
  const kname = (k) => (typeof k === 'number' ? KINDS[k] : k);
  function load(onProgress) {
    const list = KINDS.map((k) => [k, 'assets/' + k + '.webp']).concat([['grass', 'assets/grass.jpg'], ['dirt', 'assets/dirt.jpg'], ['wood', 'assets/wood.jpg'], ['fence', 'assets/fence.webp']]).concat(SCENERY.map((k) => [k, 'assets/sc_' + k + '.webp']));
    let done = 0;
    return Promise.all(list.map(([key, src]) => new Promise((res) => {
      const im = new Image(); im.onload = () => { img[key] = im; done++; onProgress && onProgress(done / list.length); res(); };
      im.onerror = () => { done++; onProgress && onProgress(done / list.length); res(); };
      im.src = src + '?v=' + V;
    })));
  }
  // high-quality downscaled copies of each sprite, per pixel size
  const cache = {};
  function sprite(kind, px) {
    const key = kind + ':' + px; if (cache[key]) return cache[key];
    const im = img[kind]; if (!im) return null;
    let src = im, w = im.width;
    while (w / 2 > px * 1.2) { const c = document.createElement('canvas'); w = Math.round(w / 2); c.width = c.height = w; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, w); src = c; }
    const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, px, px);
    cache[key] = c; return c;
  }
  // Draw an animal centred at (x,y); `px` = cell size in CSS pixels, rot = radians (0 = head up)
  function drawAnimal(c, kind, x, y, px, rot, opt) {
    kind = kname(kind); opt = opt || {};
    const dpr = opt.dpr || 1, sc = opt.scale || 1;
    const size = px * 1.08 * sc;
    c.save(); c.translate(x, y);
    if (opt.alpha != null) c.globalAlpha = opt.alpha;
    // soft contact shadow
    c.save(); c.rotate(rot || 0); c.fillStyle = 'rgba(40,30,10,0.28)'; c.beginPath(); c.ellipse(size * 0.05, size * 0.08, size * 0.3, size * 0.42, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.rotate(rot || 0);
    if (opt.sx) c.scale(1 + opt.sx, 1 - opt.sx * 0.5);
    const sp = sprite(kind, Math.max(8, Math.round(size * dpr)));
    if (sp) c.drawImage(sp, -size / 2, -size / 2, size, size);
    else { c.fillStyle = INFO[kind].color; c.beginPath(); c.ellipse(0, 0, size * 0.3, size * 0.42, 0, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // mystery box: a dark wooden crate with a question mark, slightly glossy
  function drawMystery(c, x, y, px, flip) {
    const s = px * 0.86 * (flip == null ? 1 : flip);
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,0.25)'; rr(c, -s / 2 + px * 0.03, -px * 0.43 + px * 0.05, s, px * 0.86, px * 0.12); c.fill();
    const g = c.createLinearGradient(0, -px * 0.43, 0, px * 0.43); g.addColorStop(0, '#5a5870'); g.addColorStop(1, '#2f2d3d');
    c.fillStyle = g; rr(c, -s / 2, -px * 0.43, s, px * 0.86, px * 0.12); c.fill();
    c.strokeStyle = '#787690'; c.lineWidth = px * 0.05; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.10)'; rr(c, -s / 2 + px * 0.06, -px * 0.38, s - px * 0.12, px * 0.25, px * 0.08); c.fill();
    if (s > px * 0.3) {
      c.fillStyle = '#c9c6e6'; c.font = '900 ' + Math.round(px * 0.56) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.scale(s / (px * 0.86), 1); c.fillText('?', 0, px * 0.03);
    }
    c.restore();
  }
  const patterns = {};
  function pattern(c, key, unitPx, tileUnits) {
    const im = img[key]; if (!im) return null;
    const k = key + ':' + Math.round(unitPx * tileUnits);
    let p = patterns[k];
    if (!p) { const sz = Math.max(32, Math.round(unitPx * tileUnits)); const cv = document.createElement('canvas'); cv.width = cv.height = sz; const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, sz, sz); p = { cv, sz }; patterns[k] = p; }
    return c.createPattern(p.cv, 'repeat');
  }
  root.BPArt = { KINDS, INFO, FLOOR, SCENERY, img, load, drawAnimal, drawMystery, pattern, rr, kname };
})(this);
