/* Zero Sixty: every sound is synthesised with Web Audio. No sample files. */
(function () {
  'use strict';
  const EZ = window.EZ;

  const A = (EZ.Audio = {
    ctx: null,
    ready: false,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.connect(ctx.destination);
      this.out = ctx.createGain();
      this.out.connect(comp);
      this.master = ctx.createGain(); // sound effects
      this.master.connect(this.out);

      // white noise, reused by every noisy sound
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // electric drivetrain: low hum, inverter whine, a little gear mesh
      this.motorGain = ctx.createGain();
      this.motorGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7;
      this.motorLP = lp;
      lp.connect(this.motorGain);
      this.motorGain.connect(this.master);
      this.hum = ctx.createOscillator(); this.hum.type = 'sawtooth';
      this.hum2 = ctx.createOscillator(); this.hum2.type = 'square';
      const humG = ctx.createGain(); humG.gain.value = 0.16;
      const hum2G = ctx.createGain(); hum2G.gain.value = 0.05;
      this.hum.connect(humG); this.hum2.connect(hum2G); humG.connect(lp); hum2G.connect(lp);
      this.whine = ctx.createOscillator(); this.whine.type = 'sine';
      this.whineG = ctx.createGain(); this.whineG.gain.value = 0;
      this.whine.connect(this.whineG); this.whineG.connect(this.master);
      this.hum.start(); this.hum2.start(); this.whine.start();

      // wind and tyre roar
      this.wind = ctx.createBufferSource(); this.wind.buffer = this.noise; this.wind.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
      this.windBP = bp;
      this.windG = ctx.createGain(); this.windG.gain.value = 0;
      this.wind.connect(bp); bp.connect(this.windG); this.windG.connect(this.master);
      this.wind.start();

      // siren: a soft, distant wail that only gets noticeable when a cruiser is on your bumper
      this.siren = ctx.createOscillator(); this.siren.type = 'sine'; this.siren.frequency.value = 760;
      this.sirenLFO = ctx.createOscillator(); this.sirenLFO.frequency.value = 0.26;
      this.sirenDepth = ctx.createGain(); this.sirenDepth.gain.value = 190;
      this.sirenLFO.connect(this.sirenDepth); this.sirenDepth.connect(this.siren.frequency);
      const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1400; sf.Q.value = 0.5;
      this.sirenG = ctx.createGain(); this.sirenG.gain.value = 0;
      this.siren.connect(sf); sf.connect(this.sirenG); this.sirenG.connect(this.master);
      this.siren.start(); this.sirenLFO.start();

      // helicopter thump
      this.rotor = ctx.createBufferSource(); this.rotor.buffer = this.noise; this.rotor.loop = true;
      const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 180;
      this.rotorAM = ctx.createGain(); this.rotorAM.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 17; lfo.type = 'square';
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
      lfo.connect(lfoG); lfoG.connect(this.rotorAM.gain);
      this.rotorG = ctx.createGain(); this.rotorG.gain.value = 0;
      this.rotor.connect(rlp); rlp.connect(this.rotorAM); this.rotorAM.connect(this.rotorG); this.rotorG.connect(this.master);
      this.rotor.start(); lfo.start();

      // suction fans: a high, airy whine that rises when they pull hard
      this.fanSrc = ctx.createBufferSource(); this.fanSrc.buffer = this.noise; this.fanSrc.loop = true;
      this.fanBP = ctx.createBiquadFilter(); this.fanBP.type = 'bandpass'; this.fanBP.frequency.value = 1600; this.fanBP.Q.value = 3;
      this.fanTone = ctx.createOscillator(); this.fanTone.type = 'sine'; this.fanTone.frequency.value = 700;
      this.fanToneG = ctx.createGain(); this.fanToneG.gain.value = 0.25;
      this.fanG = ctx.createGain(); this.fanG.gain.value = 0;
      this.fanSrc.connect(this.fanBP); this.fanBP.connect(this.fanG);
      this.fanTone.connect(this.fanToneG); this.fanToneG.connect(this.fanG);
      this.fanG.connect(this.master);
      this.fanSrc.start(); this.fanTone.start();

      this.ready = true;
      this.applySettings();
      EZ.Music.init(this);
    },
    // first touch or key press anywhere: audio may only start after a gesture
    unlock() {
      this.init();
      this.resume();
      if (this.ready) EZ.Music.start();
    },
    suspend() {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    },
    fan(level) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.fanG.gain.setTargetAtTime(Math.max(0, level - 0.15) * 0.09, t, 0.12);
      this.fanBP.frequency.setTargetAtTime(1200 + level * 1800, t, 0.12);
      this.fanTone.frequency.setTargetAtTime(500 + level * 1100, t, 0.12);
    },
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    applySettings() {
      if (!this.out) return;
      const s = EZ.store.data.settings, t = this.ctx.currentTime;
      this.out.gain.setTargetAtTime(s.sound ? 1 : 0, t, 0.05);
      this.master.gain.setTargetAtTime(s.volume * 0.9, t, 0.05);
      EZ.Music.setVolume();
    },
    // continuous layers, called every frame
    drive(speed, accel, boosting, on) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const v = on ? speed : 0;
      this.hum.frequency.setTargetAtTime(38 + v * 2.1, t, 0.05);
      this.hum2.frequency.setTargetAtTime(57 + v * 3.2, t, 0.05);
      this.motorLP.frequency.setTargetAtTime(500 + v * 22 + Math.max(0, accel) * 30, t, 0.08);
      this.motorGain.gain.setTargetAtTime(on ? 0.12 + Math.min(0.2, Math.max(0, accel) * 0.02) + (boosting ? 0.08 : 0) : 0, t, 0.1);
      this.whine.frequency.setTargetAtTime(420 + v * 46 + (boosting ? 900 : 0), t, 0.06);
      this.whineG.gain.setTargetAtTime(on ? 0.012 + Math.min(0.03, v * 0.0004) + (boosting ? 0.03 : 0) : 0, t, 0.1);
      this.windG.gain.setTargetAtTime(on ? Math.min(0.32, v * v * 0.00005) : 0, t, 0.15);
      this.windBP.frequency.setTargetAtTime(300 + v * 9, t, 0.2);
    },
    sirenLevel(level, close) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.sirenG.gain.setTargetAtTime(Math.min(0.045, level * 0.045), t, 0.4);
      this.sirenLFO.frequency.setTargetAtTime(close ? 1.3 : 0.26, t, 0.5);
      this.sirenDepth.gain.setTargetAtTime(close ? 150 : 190, t, 0.5);
    },
    rotorLevel(level) {
      if (!this.ready) return;
      this.rotorG.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.4);
    },
    // ---------------------------------------------------------------- one-shots
    tone(type, f0, f1, dur, vol, delay = 0) {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime + delay;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    },
    hiss(dur, vol, f0, f1, type = 'bandpass', q = 1, delay = 0) {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime + delay;
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t, Math.random()); src.stop(t + dur + 0.05);
    },
    hop() { this.hiss(0.45, 0.5, 2400, 600, 'highpass', 0.5); this.tone('sine', 160, 60, 0.22, 0.25); },
    roll() { this.hiss(0.7, 0.55, 900, 3800, 'bandpass', 0.9); this.hiss(0.35, 0.4, 3000, 700, 'highpass', 0.5); this.tone('sine', 220, 90, 0.3, 0.18); },
    land(v) { this.tone('sine', 90, 40, 0.18, Math.min(0.5, 0.15 + v * 0.03)); this.hiss(0.12, 0.12, 900, 200, 'lowpass'); },
    lower() { this.hiss(0.5, 0.22, 3000, 1200, 'highpass', 0.4); this.tone('square', 70, 50, 0.12, 0.05); },
    fizzle() { this.tone('square', 220, 110, 0.18, 0.06); },
    volt(step) {
      const base = 880 * Math.pow(2, (Math.min(step, 12) % 13) / 12);
      this.tone('sine', base, base * 1.5, 0.11, 0.09);
      this.tone('triangle', base * 2, base * 2, 0.06, 0.03, 0.02);
    },
    nearMiss() { this.hiss(0.35, 0.35, 400, 2600, 'bandpass', 1.4); },
    scrape() { this.hiss(0.4, 0.4, 3000, 900, 'bandpass', 2); this.tone('sawtooth', 120, 70, 0.25, 0.12); },
    cone() { this.tone('square', 300, 160, 0.08, 0.06); this.hiss(0.1, 0.12, 1500, 800); },
    crash() {
      this.hiss(1.2, 0.9, 1800, 120, 'lowpass', 0.6);
      this.tone('sine', 110, 30, 0.6, 0.6);
      this.hiss(0.6, 0.4, 5000, 2000, 'highpass', 0.6, 0.05);
    },
    glass() {
      for (let i = 0; i < 5; i++) this.tone('sine', 2400 + Math.random() * 2600, 1800 + Math.random() * 1500, 0.09, 0.03, i * 0.03 + Math.random() * 0.03);
      this.hiss(0.35, 0.18, 6000, 3500, 'highpass', 0.7);
    },
    thud(v) {
      this.tone('sine', 85, 38, 0.22, Math.min(0.45, 0.12 + v * 0.025));
      this.hiss(0.25, Math.min(0.35, 0.08 + v * 0.02), 900, 200, 'lowpass', 0.8);
      if (v > 6) this.hiss(0.3, 0.16, 2600, 1100, 'bandpass', 1.6, 0.02);
    },
    spike() { this.hiss(0.9, 0.5, 5000, 800, 'highpass', 0.6); this.tone('sawtooth', 90, 50, 0.4, 0.1); },
    boost() { this.tone('sawtooth', 120, 1400, 0.7, 0.14); this.hiss(0.9, 0.3, 300, 3000, 'bandpass', 0.8); },
    pickup() { [0, 0.08, 0.16].forEach((d, i) => this.tone('triangle', 520 * (1 + i * 0.26), 520 * (1 + i * 0.26), 0.16, 0.12, d)); },
    whoop() {
      if (!this.ready) return;
      this.tone('sine', 520, 1150, 0.28, 0.06);
      this.tone('sine', 1150, 520, 0.3, 0.05, 0.3);
    },
    launch() {
      this.tone('sine', 95, 32, 0.6, 0.4); // the thump you feel in your chest
      this.hiss(0.9, 0.6, 500, 3400, 'bandpass', 0.7); // cold gas leaving the rear nozzles
      this.tone('sawtooth', 160, 1900, 0.85, 0.06); // the motors winding up
    },
    click() { this.tone('square', 1800, 1200, 0.03, 0.03); },
    wreck() { this.hiss(0.8, 0.5, 1200, 100, 'lowpass', 0.6); this.tone('sine', 80, 35, 0.5, 0.35, 0.05); },
    bust() { this.tone('triangle', 700, 700, 0.12, 0.12); this.tone('triangle', 700, 700, 0.12, 0.12, 0.2); },
    // set pieces
    gustWarn() { this.hiss(0.95, 0.3, 180, 1100, 'bandpass', 0.8); },
    gust() { this.hiss(0.9, 0.55, 1400, 240, 'bandpass', 0.7); this.tone('sine', 70, 45, 0.5, 0.12); },
    droneIn() { this.hiss(1.4, 0.18, 2600, 5200, 'bandpass', 4); this.tone('sawtooth', 210, 260, 1.2, 0.025); },
    mineDrop() { this.tone('sine', 900, 260, 0.3, 0.06); },
    mineArm() { this.tone('square', 1500, 1500, 0.05, 0.035); this.tone('square', 1500, 1500, 0.05, 0.035, 0.09); },
    emp() {
      this.tone('sawtooth', 2200, 55, 0.55, 0.16);
      this.hiss(0.6, 0.45, 7000, 500, 'highpass', 0.7);
      this.tone('square', 60, 40, 0.4, 0.08, 0.05);
    },
    gate() { this.tone('square', 980, 980, 0.07, 0.05); this.tone('square', 740, 740, 0.12, 0.05, 0.1); },
    snap() { this.tone('square', 320, 70, 0.09, 0.1); this.hiss(0.15, 0.25, 3000, 900, 'bandpass', 1.5); },
    deck() { this.hiss(0.35, 0.3, 600, 180, 'lowpass', 0.8); this.tone('triangle', 150, 95, 0.22, 0.14); },
    chargeOn() { this.tone('sine', 520, 1040, 0.35, 0.05); this.tone('sine', 1040, 1040, 0.25, 0.03, 0.3); },
    tollBeep() { this.tone('sine', 1320, 1320, 0.08, 0.05); this.tone('sine', 1760, 1760, 0.1, 0.05, 0.09); },
    silence() {
      if (!this.ready) return;
      this.drive(0, 0, false, false);
      this.sirenLevel(0, false);
      this.rotorLevel(0);
      this.fan(0);
    },
  });
})();
