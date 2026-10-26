/* Zero Sixty: the soundtrack, synthesised live with Web Audio and scheduled a beat ahead.

   F# minor, 128 BPM, chords i - VI - III - VII. Four intensity levels:
   0 menus: pad and a slow arpeggio
   1 driving: four-on-the-floor kick, clap, offbeat bass that pumps against the kick
   2 danger (cruisers close, spotlight, Launch, suction tube): open hats, percussion and the hook
   Pause muffles it. A bust drops it with a falling sting. */
(function () {
  'use strict';
  const EZ = window.EZ;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const BPM = 128;
  const STEP = 60 / BPM / 4;
  const BAR = STEP * 16;
  const CHORDS = [
    { root: 42, third: 3 }, // F#m
    { root: 38, third: 4 }, // D
    { root: 45, third: 4 }, // A
    { root: 40, third: 4 }, // E
  ];
  const _ = null;
  const HOOK = [
    73, _, _, 76, _, 78, _, 76, _, 73, _, _, 71, _, 69, _,
    69, _, _, 71, _, 73, _, 74, _, 73, _, _, 69, _, 66, _,
    69, _, _, 73, _, 76, _, 81, _, 78, _, _, 76, _, 73, _,
    76, _, _, 80, _, 83, _, 80, _, 76, _, _, 71, _, 68, _,
  ];
  const LAYER = { pad: 0.42, arp: 0.5, drums: 0.95, bass: 0.85, lead: 0.5, perc: 0.55 };

  const M = (EZ.Music = {
    ready: false,
    level: -1,
    step: 0,
    timer: null,
    on: {},

    init(A) {
      const ctx = (this.ctx = A.ctx);
      this.A = A;
      this.vol = ctx.createGain();
      this.vol.gain.value = 0;
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 18000;
      this.bus = ctx.createGain();
      this.bus.connect(this.muffle);
      this.muffle.connect(this.vol);
      this.vol.connect(A.out);

      // sidechain pump: the kick ducks pad, bass and arp
      this.pump = ctx.createGain();
      this.pump.connect(this.bus);

      this.layers = {};
      for (const k of Object.keys(LAYER)) {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(k === 'drums' || k === 'perc' || k === 'lead' ? this.bus : this.pump);
        this.layers[k] = g;
      }
      // dotted-eighth echo for the plucks and the hook
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = STEP * 3;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const dlp = ctx.createBiquadFilter();
      dlp.type = 'lowpass';
      dlp.frequency.value = 2200;
      this.delay.connect(dlp);
      dlp.connect(fb);
      fb.connect(this.delay);
      this.echo = ctx.createGain();
      this.echo.gain.value = 0.45;
      dlp.connect(this.echo);
      this.echo.connect(this.bus);
      // a short room for the pad
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.impulse(2.4);
      const vg = ctx.createGain();
      vg.gain.value = 0.5;
      this.verb.connect(vg);
      vg.connect(this.bus);

      this.bassCut = 300;
      this.ready = true;
      this.setVolume();
    },
    impulse(sec) {
      const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      }
      return b;
    },
    setVolume() {
      if (!this.ready) return;
      const s = EZ.store.data.settings;
      const v = s.music == null ? 0.7 : s.music;
      this.vol.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1);
    },
    start() {
      if (!this.ready || this.timer) return;
      this.next = this.ctx.currentTime + 0.12;
      this.timer = setInterval(() => this.tick(), 25);
      if (this.level < 0) this.setLevel(0);
    },
    tick() {
      const ctx = this.ctx;
      if (ctx.state !== 'running') return;
      // after a long stall (tab hidden) jump ahead instead of firing a burst of old notes
      if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.05;
      while (this.next < ctx.currentTime + 0.14) {
        this.schedule(this.step, this.next);
        this.next += STEP;
        this.step = (this.step + 1) % 64;
      }
    },
    setLevel(n) {
      if (!this.ready || n === this.level) return;
      this.level = n;
      const t = this.ctx.currentTime;
      this.on = { pad: true, arp: true, drums: n >= 1, bass: n >= 1, lead: n >= 2, perc: n >= 2 };
      // on the menus the pad and arpeggio carry the music alone, so they come up
      const gain = (k) => (!this.on[k] ? 0 : n === 0 && (k === 'pad' || k === 'arp') ? LAYER[k] * 2.2 : LAYER[k]);
      for (const k in this.layers) this.layers[k].gain.setTargetAtTime(gain(k), t, n >= 1 ? 0.25 : 0.6);
      this.bassCut = n >= 2 ? 560 : 300;
    },
    setMuffled(on) {
      if (!this.ready) return;
      this.muffle.frequency.setTargetAtTime(on ? 650 : 18000, this.ctx.currentTime, 0.15);
    },

    // ---------------------------------------------------------------- sequencer
    schedule(step, t) {
      const s = step % 16, bar = (step / 16) | 0, ch = CHORDS[bar], on = this.on;
      if (s === 0) this.pad(t, ch);
      if (on.drums) {
        if (s % 4 === 0) this.kick(t);
        if (s === 4 || s === 12) this.clap(t);
        if (s % 4 === 2) this.hat(t, 0.32, 0.05);
        if (on.perc) {
          if (s % 2 === 1) this.hat(t, 0.12, 0.03, 'perc');
          if (s === 14) this.hat(t, 0.22, 0.24, 'perc');
          if (bar === 3 && s >= 12) this.clap(t, 0.35 + (s - 12) * 0.1);
        }
      }
      if (on.bass && s % 4 !== 0) {
        const off = s >= 13 ? [7, 12, 7][s - 13] : s % 4 === 2 ? 12 : 0;
        this.bass(t, hz(ch.root + off));
      }
      const tones = [0, ch.third, 7, 12, 12 + ch.third, 12, 7, ch.third];
      if (this.level === 0) {
        if (s % 2 === 0) this.pluck(t, hz(ch.root + 24 + tones[(s / 2) % 8]), 0.13);
      } else {
        this.pluck(t, hz(ch.root + 24 + tones[s % 8]), s % 4 === 0 ? 0.16 : 0.1);
      }
      if (on.lead) {
        const n = HOOK[step];
        if (n) this.lead(t, hz(n));
      }
    },

    // ---------------------------------------------------------------- instruments
    env(g, t, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    },
    noise(t, dur) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.A.noise;
      src.start(t, Math.random() * 1.5, dur + 0.05);
      return src;
    },
    kick(t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(155, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
      this.env(g, t, 0.95, 0.004, 0.36);
      o.connect(g); g.connect(this.layers.drums);
      o.start(t); o.stop(t + 0.42);
      const p = this.pump.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(0.3, t);
      p.linearRampToValueAtTime(1, t + STEP * 3);
    },
    clap(t, v = 0.5) {
      const ctx = this.ctx;
      const src = this.noise(t, 0.25), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 1350; f.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(v * 0.25, t + 0.012);
      g.gain.exponentialRampToValueAtTime(v * 0.9, t + 0.016);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      src.connect(f); f.connect(g); g.connect(this.layers.drums);
    },
    hat(t, v, len, layer = 'drums') {
      const ctx = this.ctx;
      const src = this.noise(t, len + 0.02), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 7200;
      this.env(g, t, v, 0.002, len);
      src.connect(f); f.connect(g); g.connect(this.layers[layer]);
    },
    bass(t, f) {
      const ctx = this.ctx;
      const a = ctx.createOscillator(), b = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      a.type = 'sawtooth'; a.frequency.value = f; a.detune.value = -7;
      b.type = 'square'; b.frequency.value = f / 2;
      lp.type = 'lowpass'; lp.Q.value = 7;
      lp.frequency.setValueAtTime(this.bassCut * 4, t);
      lp.frequency.exponentialRampToValueAtTime(this.bassCut, t + 0.11);
      this.env(g, t, 0.34, 0.005, STEP * 0.9);
      a.connect(lp); b.connect(lp); lp.connect(g); g.connect(this.layers.bass);
      a.start(t); b.start(t); a.stop(t + STEP + 0.05); b.stop(t + STEP + 0.05);
    },
    pluck(t, f, v) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(3400, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.16);
      this.env(g, t, v, 0.003, 0.2);
      o.connect(lp); lp.connect(g); g.connect(this.layers.arp); g.connect(this.delay);
      o.start(t); o.stop(t + 0.26);
    },
    lead(t, f) {
      const ctx = this.ctx;
      const a = ctx.createOscillator(), b = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      a.type = 'sawtooth'; a.frequency.value = f;
      b.type = 'sawtooth'; b.frequency.value = f; b.detune.value = 9;
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 3.6);
      a.connect(lp); b.connect(lp); lp.connect(g); g.connect(this.layers.lead); g.connect(this.delay);
      a.start(t); b.start(t); a.stop(t + STEP * 4); b.stop(t + STEP * 4);
    },
    pad(t, ch) {
      const ctx = this.ctx;
      const lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 1150;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.35);
      g.gain.setValueAtTime(0.05, t + BAR - 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + BAR + 0.6);
      lp.connect(g); g.connect(this.layers.pad); g.connect(this.verb);
      for (const n of [12, 12 + ch.third, 19, 24]) {
        for (const d of [-8, 8]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth'; o.frequency.value = hz(ch.root + n); o.detune.value = d;
          o.connect(lp);
          o.start(t); o.stop(t + BAR + 0.7);
        }
      }
    },

    // ---------------------------------------------------------------- moments
    // a rising whoosh for Launch and the suction tube
    riser(dur = 1.1) {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = this.noise(t, dur + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(350, t);
      f.frequency.exponentialRampToValueAtTime(6000, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
      src.connect(f); f.connect(g); g.connect(this.bus);
    },
    // a falling power-down when you're caught, then just the pad
    sting() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(hz(61), t);
      o.frequency.exponentialRampToValueAtTime(hz(30), t + 1.1);
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + 1.1);
      this.env(g, t, 0.22, 0.01, 1.15);
      o.connect(lp); lp.connect(g); g.connect(this.bus);
      o.start(t); o.stop(t + 1.25);
      [73, 69, 66, 61].forEach((n, i) => this.pluck(t + i * 0.13, hz(n), 0.16));
      this.setLevel(0);
    },
  });
})();
