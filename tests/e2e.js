// Playwright smoke test. Usage: node tests/e2e.js [url] [outdir]
// Needs playwright (PW_PATH env to point at it) and a Chrome (CHROME env, default /usr/bin/google-chrome).
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:8817/';
const out = process.argv[3] || 'screenshots';
fs.mkdirSync(out, { recursive: true });
const errors = [], log = [];
const check = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) errors.push(m); };
const idle = (page) => page.waitForFunction(() => window.__bp && !window.__bp.busy, null, { timeout: 20000 });

// Plays the solver's solution for the current level through real taps.
async function playSolution(page, stopAfter, minPath) {
  const sol = await page.evaluate(() => { const G = window.BPGame; const r = G.solve(window.__bp.lv); return r.solution; });
  let n = 0;
  for (const m of sol) {
    if (stopAfter != null && n >= stopAfter && (await page.evaluate(() => window.__bp.S.path.length)) >= (minPath || 0)) break;
    const pt = await page.evaluate((m) => { const S = window.__bp.S; const c = S.crates[m.c]; const i = m.end === 0 ? window.BPGame.firstLive(c) : window.BPGame.lastLive(c); return window.__bp.cellScreen(m.c, i); }, m);
    await page.mouse.click(pt.x, pt.y);
    await idle(page); n++;
  }
  return n;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bp && window.__bp.S);
  check(await page.title() === 'Barnyard Parade', 'title is the game name');
  // first launch shows help
  await page.waitForTimeout(500);
  check((await page.evaluate(() => window.__bp.modal)) === 'How to play', 'help shown on first launch');
  await page.click('#m-buttons .btn');
  // level 1: play the verified solution
  await playSolution(page);
  await page.waitForTimeout(900);
  check((await page.evaluate(() => window.__bp.S.status)) === 'won', 'level 1 won with solver moves');
  check((await page.evaluate(() => window.__bp.modal)) === 'Level 1 complete!', 'level complete dialog');
  await page.screenshot({ path: out + '/level-complete.png' });
  const bank = await page.evaluate(() => window.__bp.save.bank);
  check(bank.undo === 3, 'level 1 reward banked (+1 undo): ' + JSON.stringify(bank));
  await page.click('#btn-next');
  await idle(page);
  check((await page.evaluate(() => window.__bp.S.level)) === 2, 'next level is 2');
  // reload keeps progress
  await page.reload(); await page.waitForFunction(() => window.__bp && window.__bp.S);
  check((await page.evaluate(() => window.__bp.S.level)) === 2, 'progress persisted');
  // a mid-level screenshot on a richer level (glass + ? tiles)
  await page.evaluate(() => { window.__bp.unlock(20); window.__bp.start(20); });
  await idle(page);
  await playSolution(page, 5, 5);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/level-in-progress.png' });
  const st = await page.evaluate(() => ({ len: window.__bp.S.path.length, status: window.__bp.S.status, cap: document.querySelector('#cap-text').textContent }));
  check(st.status === 'play', 'level 20 still in play mid-way: ' + JSON.stringify(st));
  // undo power-up
  const before = await page.evaluate(() => window.__bp.S.moves);
  await page.click('.pw[data-pw=undo]'); await idle(page);
  check((await page.evaluate(() => window.__bp.S.moves)) === before - 1, 'undo reverts one move');
  // map
  await page.evaluate(() => window.__bp.showMap());
  await page.waitForTimeout(300);
  check(await page.isVisible('#map'), 'level map opens');
  await page.screenshot({ path: out + '/map.png' });
  await page.click('#map-close');
  // settings
  await page.click('#btn-settings'); await page.waitForTimeout(200);
  check((await page.evaluate(() => window.__bp.modal)) === 'Settings', 'settings open');
  await page.screenshot({ path: out + '/settings.png' });
  // iPad layout
  const pad = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  pad.on('pageerror', (e) => errors.push('pad pageerror: ' + e.message));
  await pad.goto(url); await pad.waitForFunction(() => window.__bp && window.__bp.S); await pad.waitForTimeout(500);
  await pad.screenshot({ path: out + '/ipad.png' });
  await browser.close();
  console.log(log.join('\n'));
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('e2e OK');
})().catch((e) => { console.error(e); process.exit(1); });
