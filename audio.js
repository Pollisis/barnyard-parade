// Barnyard Parade: all sound is synthesized live with WebAudio (original; no recorded samples).
(function (root) {
  'use strict';
  let ctx = null, master, sfxBus, musicBus;
  const st = { music: 0.5, sfx: 0.8, muted: false };
  let musicOn = false, nextNote = 0, step = 0, timer = null;
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    apply();
    return ctx;
  }
  function apply() { if (!ctx) return; master.gain.value = st.muted ? 0 : 1; sfxBus.gain.value = st.sfx; musicBus.gain.value = st.music * 0.35; }
  function set(o) { Object.assign(st, o); apply(); }

  function env(g, t, a, peak, d, end) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end || 0.0001, t + a + d); }
  function tone(o) {
    // o: {type,f0,f1,t,dur,vol,filter,fq,q,vib,vibDepth,bus,a}
    const c = ensure(); if (!c) return;
    const t = (o.t != null ? o.t : c.currentTime) + 0.005;
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    if (o.fmid) { osc.frequency.exponentialRampToValueAtTime(o.fmid, t + o.dur * 0.45); osc.frequency.exponentialRampToValueAtTime(o.f1 || o.f0, t + o.dur); }
    let node = osc;
    if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibDepth || 10; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + o.dur + 0.05); }
    if (o.filter) { const f = c.createBiquadFilter(); f.type = o.filter; f.frequency.value = o.fq || 1000; f.Q.value = o.q || 1; node.connect(f); node = f; }
    const g = c.createGain(); env(g, t, o.a || 0.01, o.vol || 0.3, o.dur);
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + (o.a || 0.01) + o.dur + 0.05);
  }
  function noise(o) {
    const c = ensure(); if (!c) return;
    const t = (o.t != null ? o.t : c.currentTime) + 0.005;
    const len = Math.ceil(c.sampleRate * o.dur); const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.frequency.value = o.fq || 2000; f.Q.value = o.q || 1;
    const g = c.createGain(); env(g, t, o.a || 0.005, o.vol || 0.2, o.dur);
    s.connect(f); f.connect(g); g.connect(o.bus || sfxBus); s.start(t); s.stop(t + o.dur + 0.05);
  }
  const now = () => (ensure() ? ctx.currentTime : 0);
  const voices = {
    pig() { const t = now(); for (const d of [0, 0.15]) tone({ type: 'sawtooth', f0: 210, f1: 120, t: t + d, dur: 0.12, vol: 0.35, filter: 'bandpass', fq: 700, q: 4, vib: 40, vibDepth: 30 }); },
    chick() { const t = now(); for (const d of [0, 0.11]) tone({ type: 'sine', f0: 2600, fmid: 3600, f1: 2900, t: t + d, dur: 0.08, vol: 0.25 }); },
    sheep() { tone({ type: 'sawtooth', f0: 420, f1: 380, dur: 0.5, vol: 0.28, filter: 'bandpass', fq: 1100, q: 3, vib: 22, vibDepth: 25, a: 0.04 }); },
    blacksheep() { tone({ type: 'sawtooth', f0: 300, f1: 270, dur: 0.5, vol: 0.3, filter: 'bandpass', fq: 850, q: 3, vib: 20, vibDepth: 20, a: 0.04 }); },
    frog() { const t = now(); for (const d of [0, 0.2]) tone({ type: 'square', f0: 260, f1: 200, t: t + d, dur: 0.14, vol: 0.18, filter: 'lowpass', fq: 900, vib: 35, vibDepth: 60 }); },
    duck() { const t = now(); for (const d of [0, 0.17]) tone({ type: 'square', f0: 560, f1: 400, t: t + d, dur: 0.12, vol: 0.2, filter: 'bandpass', fq: 1300, q: 3 }); },
    cow() { tone({ type: 'sawtooth', f0: 150, fmid: 175, f1: 115, dur: 0.75, vol: 0.35, filter: 'lowpass', fq: 700, q: 4, a: 0.08 }); },
    bunny() { tone({ type: 'sine', f0: 1700, fmid: 2500, f1: 1900, dur: 0.12, vol: 0.25 }); },
    hen() { const t = now(); for (const d of [0, 0.09, 0.18]) tone({ type: 'triangle', f0: 760, f1: 520, t: t + d, dur: 0.06, vol: 0.3, filter: 'bandpass', fq: 1100, q: 2 }); },
    goat() { tone({ type: 'sawtooth', f0: 540, f1: 480, dur: 0.45, vol: 0.25, filter: 'bandpass', fq: 1200, q: 3, vib: 11, vibDepth: 60, a: 0.03 }); },
  };
  const fx = {
    animal(k) { if (typeof k === 'number') k = root.BPGame.KINDS[k]; (voices[k] || voices.pig)(); },
    pop() { tone({ type: 'sine', f0: 500, f1: 900, dur: 0.07, vol: 0.25 }); },
    hop() { tone({ type: 'triangle', f0: 380, f1: 760, dur: 0.12, vol: 0.18 }); },
    whoosh() { noise({ dur: 0.35, fq: 1400, q: 0.8, vol: 0.18, a: 0.08 }); },
    nope() { tone({ type: 'square', f0: 180, f1: 140, dur: 0.12, vol: 0.12, filter: 'lowpass', fq: 800 }); },
    glass() { const t = now(); tone({ type: 'sine', f0: 1500, f1: 1600, t, dur: 0.15, vol: 0.15 }); },
    shatter() { const t = now(); noise({ t, dur: 0.4, fq: 5000, q: 0.7, vol: 0.3, filter: 'highpass' }); for (const [d, f] of [[0, 2400], [0.05, 3100], [0.1, 2700]]) tone({ type: 'sine', f0: f, t: t + d, dur: 0.2, vol: 0.12 }); },
    clear() { const t = now(); [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, t: t + i * 0.07, dur: 0.25, vol: 0.22 })); },
    win() { const t = now(); [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, t: t + i * 0.12, dur: 0.3, vol: 0.25 })); },
    lose() { const t = now(); [392, 349, 311].forEach((f, i) => tone({ type: 'triangle', f0: f, t: t + i * 0.18, dur: 0.3, vol: 0.2 })); },
    power() { const t = now(); [660, 880, 1320].forEach((f, i) => tone({ type: 'sine', f0: f, t: t + i * 0.05, dur: 0.15, vol: 0.18 })); },
    click() { tone({ type: 'sine', f0: 900, dur: 0.04, vol: 0.12 }); },
    step(n) { const v = 0.05 + Math.min(8, n) * 0.012; noise({ dur: 0.05, fq: 260 + Math.random() * 120, q: 1.5, vol: v, filter: 'lowpass' }); tone({ type: 'sine', f0: 110 + Math.random() * 30, f1: 70, dur: 0.06, vol: v * 0.8 }); },
    park() { tone({ type: 'sine', f0: 620, f1: 980, dur: 0.08, vol: 0.12 }); },
    chime() { const t = now(); [1047, 1319, 1568, 2093].forEach((f, i) => { tone({ type: 'sine', f0: f, t: t + i * 0.09, dur: 0.6, vol: 0.18 }); tone({ type: 'triangle', f0: f * 2, t: t + i * 0.09, dur: 0.25, vol: 0.04 }); }); },
    fence() { const t = now(); noise({ t: t + 0.25, dur: 0.12, fq: 500, q: 1, vol: 0.25, filter: 'lowpass' }); tone({ type: 'triangle', f0: 220, f1: 140, t: t + 0.25, dur: 0.12, vol: 0.2 }); },
    zoom() { tone({ type: 'sawtooth', f0: 300, f1: 1200, dur: 0.5, vol: 0.08, filter: 'lowpass', fq: 2000 }); },
    magnet() { tone({ type: 'sine', f0: 200, f1: 900, dur: 0.6, vol: 0.2, vib: 18, vibDepth: 40 }); },
  };

  // ---------- cheerful original music loop (C major, ~112 bpm, 8 bars) ----------
  const BPM = 112, S16 = 60 / BPM / 4;
  const mel = [ // [step(16ths), midi, len]
    [0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 76, 2], [8, 77, 2], [10, 76, 2], [12, 74, 4],
    [16, 71, 2], [18, 74, 2], [20, 77, 2], [22, 74, 2], [24, 76, 2], [26, 74, 2], [28, 72, 4],
    [32, 72, 2], [34, 76, 2], [36, 79, 2], [38, 81, 2], [40, 79, 2], [42, 77, 2], [44, 76, 4],
    [48, 74, 2], [50, 76, 2], [52, 77, 2], [54, 74, 2], [56, 71, 2], [58, 74, 2], [60, 72, 4],
    [64, 79, 3], [67, 77, 1], [68, 76, 2], [70, 77, 2], [72, 79, 2], [74, 81, 2], [76, 79, 4],
    [80, 77, 3], [83, 76, 1], [84, 74, 2], [86, 76, 2], [88, 77, 2], [90, 79, 2], [92, 74, 4],
    [96, 72, 2], [98, 74, 2], [100, 76, 2], [102, 79, 2], [104, 81, 2], [106, 79, 2], [108, 76, 4],
    [112, 74, 2], [114, 77, 2], [116, 76, 2], [118, 74, 2], [120, 72, 6],
  ];
  const bassRoots = [48, 53, 55, 48, 53, 50, 55, 48]; // C F G C F D G C
  const LOOP = 128;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function scheduleStep(s, t) {
    for (const n of mel) if (n[0] === s) tone({ type: 'triangle', f0: mtof(n[1]), t, dur: n[2] * S16 * 0.9, vol: 0.22, bus: musicBus, a: 0.01 });
    const bar = Math.floor(s / 16), inBar = s % 16;
    if (inBar % 4 === 0) { const root = bassRoots[bar] + (inBar === 8 ? 7 : 0); tone({ type: 'sine', f0: mtof(root - 12 + 12), t, dur: S16 * 3, vol: 0.35, bus: musicBus }); }
    if (inBar % 4 === 2) { const r = bassRoots[bar]; for (const iv of [12, 16, 19]) tone({ type: 'sine', f0: mtof(r + iv), t, dur: S16 * 1.2, vol: 0.05, bus: musicBus }); }
    if (inBar % 2 === 0) noise({ t, dur: 0.03, fq: 8000, q: 1, vol: inBar % 4 === 0 ? 0.05 : 0.03, filter: 'highpass', bus: musicBus });
    if (inBar === 4 || inBar === 12) noise({ t, dur: 0.08, fq: 1800, q: 1, vol: 0.06, bus: musicBus });
  }
  function tick() {
    if (!ctx || !musicOn) return;
    while (nextNote < ctx.currentTime + 0.25) { scheduleStep(step, nextNote); nextNote += S16; step = (step + 1) % LOOP; }
  }
  function startMusic() { const c = ensure(); if (!c || musicOn) return; musicOn = true; nextNote = c.currentTime + 0.1; step = 0; timer = setInterval(tick, 60); }
  function stopMusic() { musicOn = false; clearInterval(timer); }
  root.BPAudio = { ensure, set, state: st, fx, startMusic, stopMusic, get playing() { return musicOn; } };
})(this);
