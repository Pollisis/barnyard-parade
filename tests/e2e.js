// Playwright end-to-end test. Usage: node tests/e2e.js [url] [outdir]
// Needs playwright (PW_PATH env) and Chrome (CHROME env, default /usr/bin/google-chrome).
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:8817/';
const out = process.argv[3] || 'screenshots';
fs.mkdirSync(out, { recursive: true });
const errors = [], log = [];
const check = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) errors.push(m); };
const ready = (p) => p.waitForFunction(() => window.__bp && window.__bp.S && !window.__bp.loading, null, { timeout: 60000 });
const settled = (p) => p.waitForFunction(() => window.__bp.settled || window.__bp.S.status !== 'play', null, { timeout: 30000 });
async function tapBarn(p, b) { const pt = await p.evaluate((b) => window.__bp.barnScreen(b), b); await p.mouse.click(pt.x, pt.y); }
// Plays the verified solution with real taps; stop(p) can end it early.
async function play(p, stop) {
  const sol = await p.evaluate(() => window.__bp.lv.solution.slice());
  for (const b of sol) {
    if (stop && (await stop(p))) return false;
    await tapBarn(p, b); await settled(p);
  }
  return true;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const consoleErr = [];
  page.on('pageerror', (e) => consoleErr.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text()); });
  await page.goto(url); await ready(page);
  check((await page.title()).includes('Barnyard Parade'), 'title');
  check(await page.waitForFunction(() => window.__bp.modal === 'How to play', null, { timeout: 5000 }).then(() => true, () => false), 'help shows on first visit');
  await page.screenshot({ path: out + '/01-help.png' });
  await page.click('#m-buttons button');
  check(/^0\/16$/.test(await page.textContent('#cap-text')), 'parade sign reads 0/16');
  check((await page.evaluate(() => window.__bp.S.barns.length)) >= 8, 'barns drawn');
  const colors = await page.evaluate(() => new Set(window.__bp.S.barns.flatMap((B) => B.cells.map((a) => a.k))).size);
  check(colors >= 8, 'level 1 has ' + colors + ' colors');

  // a tap anywhere on a barn (top edge, not the front) sends its front group out
  const bank0 = await page.evaluate(() => Object.assign({}, window.__bp.save.bank));
  const first = await page.evaluate(() => window.__bp.lv.solution[0]);
  const edge = await page.evaluate((b) => { const p = window.__bp.barnScreen(b); return p; }, first);
  await page.mouse.click(edge.x, edge.y - 60 * (await page.evaluate((b) => (window.__bp.S.barns[b].top ? 1 : -1), first)));
  await page.waitForTimeout(300);
  const n1 = await page.evaluate(() => window.__bp.S.track.length + window.__bp.S.barns.reduce((a, B) => a + B.queue.length, 0));
  check(n1 > 0, 'tapping the back of a barn sends its front group (' + n1 + ')');
  const sign = await page.textContent('#cap-text');
  check(/^\d+\/16$/.test(sign) && +sign.split('/')[0] > 0, 'sign updates live (' + sign + ')');
  await page.screenshot({ path: out + '/02-first-tap.png' });
  await settled(page);
  // finish level 1 fast by replaying the solution from the start
  await page.click('#btn-restart'); await ready(page);
  await page.evaluate(() => { window.__bp.speed = 6; });
  await play(page);
  await page.waitForFunction(() => window.__bp.modal && /complete/.test(window.__bp.modal), null, { timeout: 20000 });
  check(true, 'level 1 won by playing');
  await page.screenshot({ path: out + '/03-level-complete.png' });
  const bank1 = await page.evaluate(() => window.__bp.save.bank);
  check(Object.keys(bank1).some((k) => bank1[k] > bank0[k]), 'reward banked');
  await page.click('#btn-next'); await ready(page);
  check((await page.evaluate(() => window.__bp.S.level)) === 2, 'next level');
  await page.reload(); await ready(page);
  check((await page.evaluate(() => window.__bp.S.level)) === 2, 'progress persists across reload');

  // a level with color-locked barns and ? boxes, mid-parade
  await page.evaluate(() => { window.__bp.unlock(12); window.__bp.start(9); }); await ready(page);
  const feat = await page.evaluate(() => ({ preset: window.__bp.S.barns.filter((B) => B.preset != null).length, myst: window.__bp.S.barns.reduce((a, B) => a + B.cells.filter((c) => c.mystery).length, 0) }));
  check(feat.preset > 0 && feat.myst > 0, 'level 9 has color-locked barns (' + feat.preset + ') and ? boxes (' + feat.myst + ')');
  await page.evaluate(() => { window.__bp.speed = 6; });
  const sol9 = await page.evaluate(() => window.__bp.lv.solution.slice());
  // pick an upcoming tap that sends a big group, and photograph it mid-parade
  const shotAt = 8;
  for (let i = 0; i < shotAt; i++) { await tapBarn(page, sol9[i]); await settled(page); }
  await page.evaluate(() => { window.__bp.speed = 1; });
  await tapBarn(page, sol9[shotAt]); await page.waitForTimeout(1100);
  await page.screenshot({ path: out + '/04-parade-in-progress.png' });
  check(await page.evaluate(() => window.__bp.S.track.length > 0), 'animals parading on the loop');
  await page.evaluate(() => { window.__bp.speed = 6; }); await settled(page);
  // keep going until a barn is fenced off
  const sofar = shotAt + 1;
  for (let i = sofar; i < sol9.length; i++) {
    if (await page.evaluate(() => window.__bp.S.barns.some((B) => B.cleared))) break;
    await tapBarn(page, sol9[i]); await settled(page);
  }
  await page.evaluate(() => { window.__bp.speed = 1; }); await page.waitForTimeout(1200);
  check(await page.evaluate(() => window.__bp.S.barns.some((B) => B.cleared)), 'a barn filled with 16 gets fenced');
  await page.screenshot({ path: out + '/05-cleared-barn-fence.png' });
  // tapping a fenced barn lets its animals out again
  const cb = await page.evaluate(() => window.__bp.S.barns.findIndex((B) => B.cleared));
  await page.evaluate(() => { window.__bp.save.bank.redo = Math.max(1, window.__bp.save.bank.redo); });
  const trackBefore = await page.evaluate(() => window.__bp.S.track.length);
  await tapBarn(page, cb); await page.waitForTimeout(200);
  check(await page.evaluate((cb) => !window.__bp.S.barns[cb].cleared, cb), 'animals can leave a fenced barn');
  // Redo puts them back
  await page.click('.pw[data-pw="redo"]'); await page.waitForTimeout(200);
  check(await page.evaluate(([cb, t]) => window.__bp.S.barns[cb].cleared && window.__bp.S.track.length === t, [cb, trackBefore]), 'Redo puts the last group back');

  // power-ups
  await page.evaluate(() => { const b = window.__bp.save.bank; b.plus2 = 2; b.barn = 1; b.magnet = 1; b.shuffle = 1; });
  await page.click('.pw[data-pw="plus2"]'); await page.click('.pw[data-pw="plus2"]'); await page.waitForTimeout(200);
  check(/\/20$/.test(await page.textContent('#cap-text')), '+2 stacks (' + (await page.textContent('#cap-text')) + ')');
  const nb = await page.evaluate(() => window.__bp.S.barns.length);
  await page.click('.pw[data-pw="barn"]'); await page.waitForTimeout(200);
  check((await page.evaluate(() => window.__bp.S.barns.length)) === nb + 1, 'extra barn added');
  const kinds0 = await page.evaluate(() => new Set(window.__bp.S.barns.flatMap((B) => B.cells.map((a) => a.k))).size);
  await page.click('.pw[data-pw="magnet"]'); await page.waitForTimeout(1500);
  check((await page.evaluate(() => new Set(window.__bp.S.barns.flatMap((B) => B.cells.map((a) => a.k))).size)) === kinds0 - 1, 'magnet removed one color');
  await page.click('.pw[data-pw="shuffle"]'); await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__bp.save.bank.shuffle)) === 0, 'shuffle used');
  await page.screenshot({ path: out + '/06-after-power-ups.png' });

  // game over when the parade is full with nowhere to go
  await page.evaluate(() => {
    const G = window.BPGame; const cells = [[0, 1, 1, 1, 1], [0, 2, 2, 2, 2], [0, 3, 3, 3, 3]];
    window.__bp.custom({ n: 3, board: { cells, cap: [16, 16, 16], preset: [null, null, null] }, mystery: cells.map((c) => c.map(() => false)), layout: G.makeLayout(3) }, 8);
    window.__bp.speed = 3;
  });
  await tapBarn(page, 0); await page.waitForTimeout(300); await tapBarn(page, 1);
  const lost = await page.waitForFunction(() => window.__bp.modal === 'Out of room!', null, { timeout: 15000 }).then(() => true, () => false);
  check(lost, 'game over when the parade is full and stuck');
  await page.screenshot({ path: out + '/07-out-of-room.png' });
  if (lost) await page.click('#btn-retry');
  await ready(page);

  // map + settings
  await page.evaluate(() => { window.__bp.closeModal(); window.__bp.showMap(); });
  await page.waitForTimeout(300);
  check((await page.$$('#map-nodes .node')).length >= 12, 'level map');
  await page.screenshot({ path: out + '/08-map.png' });
  await page.click('#map-close');
  await page.click('#btn-settings');
  check((await page.$$('#m-body input[type=range]')).length === 2, 'settings has volume sliders');
  await page.screenshot({ path: out + '/09-settings.png' });
  await page.evaluate(() => window.__bp.closeModal());

  // tablet
  const tab = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tp = await tab.newPage(); tp.on('pageerror', (e) => consoleErr.push(e.message));
  await tp.addInitScript(() => localStorage.setItem('barnyard-parade.save.v2', JSON.stringify({ seenHelp: true, maxLevel: 6, current: 6 })));
  await tp.goto(url); await ready(tp);
  const s6 = await tp.evaluate(() => window.__bp.lv.solution.slice(0, 4));
  for (const b of s6) { await tapBarn(tp, b); await tp.waitForTimeout(400); }
  await tp.waitForTimeout(600);
  await tp.screenshot({ path: out + '/10-tablet.png' });
  check(true, 'tablet layout');

  check(consoleErr.length === 0, 'no console errors' + (consoleErr.length ? ': ' + consoleErr.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(log.join('\n'));
  console.log(errors.length ? errors.length + ' FAILED' : 'ALL PASSED');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.log(log.join('\n')); console.error(e); process.exit(1); });
