/* Zero Sixty: the pursuit. Two cruisers follow your exact line, others try to PIT you from the
   side, and after dusk a helicopter sweeps its spotlight over the lanes. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE, C = EZ.C;
  const PI = Math.PI;

  class Police {
    constructor(game) {
      this.g = game;
      const scene = game.scene;
      this.mats = EZ.Models.mats();
      this.heli = EZ.Models.helicopter();
      this.heli.group.visible = false;
      scene.add(this.heli.group);
      const beamMat = new T.MeshBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 0.06, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide });
      this.beam = new T.Mesh(new T.CylinderGeometry(0.3, 2.7, 1, 24, 1, true).translate(0, -0.5, 0), beamMat);
      this.beam.visible = false;
      scene.add(this.beam);
      this.spot = new T.Mesh(new T.CircleGeometry(3.2, 28).rotateX(-PI / 2), new T.MeshBasicMaterial({ map: this.mats.glow, color: 0xfff6d8, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      this.spot.visible = false;
      scene.add(this.spot);
      this.lightR = new T.PointLight(0xff2038, 0, 26, 2);
      this.lightB = new T.PointLight(0x3a66ff, 0, 26, 2);
      scene.add(this.lightR, this.lightB);
      this.chase = [];
      this.reset();
    }

    reset() {
      const pool = this.g.ents.pools.cruiser;
      for (const c of this.chase) if (c.id >= 0) pool.release(c.id);
      this.chase = [];
      this.path = [];
      this.pit = null;
      this.pitTimer = EZ.rand(30, 38);
      this.heliOn = false;
      this.heliT = 0;
      this.heliCool = 40;
      this.spotX = 0;
      this.lit = false;
      this.flash = 0;
      this.heli.group.visible = this.beam.visible = this.spot.visible = false;
      this.extra = [];
      this.side = 0;
    }

    // ---------------------------------------------------------------- chase cars
    startChase() {
      const pool = this.g.ents.pools.cruiser;
      this.chase = [0, 1].map((i) => ({ id: pool.alloc(), x: EZ.laneX(1) + (i ? 1.8 : 0), s: -6 - i * 10, yaw: 0, lag: i ? 13 : 0, side: i ? 1.8 : 0 }));
      this.path = [{ s: -50, x: EZ.laneX(1) }, { s: 0, x: EZ.laneX(1) }];
    }
    // where were you at distance s?
    pathX(s) {
      const p = this.path;
      for (let i = p.length - 1; i > 0; i--) {
        if (p[i - 1].s <= s) {
          const a = p[i - 1], b = p[i];
          const t = b.s > a.s ? EZ.clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
          return EZ.lerp(a.x, b.x, t);
        }
      }
      return p.length ? p[0].x : 0;
    }
    record(p) {
      const last = this.path[this.path.length - 1];
      if (!last || p.s - last.s > 0.6) this.path.push({ s: p.s, x: p.x });
      while (this.path.length > 2 && this.path[1].s < p.s - 140) this.path.shift();
    }

    step(h, gap, running) {
      const p = this.g.player;
      if (running) this.record(p);
      const pool = this.g.ents.pools.cruiser;
      for (const c of this.chase) {
        if (c.id < 0) continue;
        const ts = p.s - C.P_HL - gap - 2.5 - c.lag;
        c.s = ts;
        const tx = EZ.clamp(this.pathX(ts) + c.side, -C.EDGE + 0.9, C.EDGE - 0.9);
        const vx = (tx - c.x) / Math.max(h, 1e-3);
        c.x = tx;
        c.yaw = EZ.damp(c.yaw, -Math.atan2(vx, Math.max(p.speed, 10)) * 0.6, 10, h);
      }
      if (this.pit) this.stepPit(h, p);
    }
    draw() {
      const pool = this.g.ents.pools.cruiser;
      for (const c of this.chase) if (c.id >= 0) pool.set(c.id, c.x, 0, -c.s, c.yaw, 0, 0, 1);
    }

    // ---------------------------------------------------------------- PIT attempts
    maybePit(dt, run) {
      const p = this.g.player;
      if (this.pit || p.jammer > 0 || p.hover > 0 || p.boosting > 0 || p.stunt || this.g.ch.isQuiet(p.s)) return;
      this.pitTimer -= dt;
      if (this.pitTimer > 0) return;
      this.pitTimer = EZ.lerp(26, 15, this.g.ents.planner.diff(p.s)) + EZ.rand(0, 6);
      const opts = [p.lane - 1, p.lane + 1].filter((l) => l >= 0 && l < C.LANES);
      const lane = EZ.pick(opts);
      const e = this.g.ents.make({
        kind: 'pit', pool: 'cruiser', type: 'hard', mode: 'rel', lane, x: EZ.laneX(lane), M: 0, k: 0,
        s: p.s - 34, near: true, ghostUntil: true,
      });
      if (!e) return;
      this.pit = { e, phase: 'approach', t: 0, rel: -34, target: EZ.laneX(lane), side: lane < p.lane ? -1 : 1 };
      this.g.say('pit', { side: lane < p.lane ? 'left' : 'right' });
      this.side = this.pit.side;
    }
    stepPit(h, p) {
      const P = this.pit, e = P.e;
      if (e.dead) { this.pit = null; this.side = 0; return; }
      if (e.mode !== 'rel') { this.pit = null; this.side = 0; return; } // it crashed out
      P.t += h;
      if (P.phase === 'approach') {
        const k = EZ.smoothstep(0, 1, P.t / 2.4);
        P.rel = EZ.lerp(-34, 0.6, k);
        // alongside now: sound the alarm, it swerves in a moment
        if (P.t >= 2.4) { P.phase = 'shadow'; P.t = 0; EZ.Audio.pitWarn(); this.g.vibrate([30, 40, 30]); }
      } else if (P.phase === 'shadow') {
        P.rel = 0.6 + Math.sin(P.t * 5) * 0.4;
        e.x = P.target + Math.sin(P.t * 9) * 0.12;
        if (P.t >= 1.4) { P.phase = 'swerve'; P.t = 0; P.from = e.x; P.to = EZ.laneX(p.lane) - P.side * 0.2; }
      } else if (P.phase === 'swerve') {
        const k = EZ.smoothstep(0, 1, P.t / 0.45);
        e.x = EZ.lerp(P.from, P.to, k);
        e.yaw = -P.side * -Math.sin(k * PI) * 0.25;
        if (P.t >= 0.75) { P.phase = 'fall'; P.t = 0; this.side = 0; }
      } else {
        P.rel -= h * 14;
        e.x = EZ.damp(e.x, P.target, 2, h);
        e.yaw = EZ.damp(e.yaw, 0, 4, h);
        if (P.rel < -70) { this.g.ents.kill(e); this.pit = null; return; }
      }
      e.ghostUntil = P.phase === 'approach' && P.rel < -9;
      e.prevS = e.s;
      e.s = p.s + P.rel;
    }
    cancelPit() {
      if (this.pit) { this.pit.phase = 'fall'; this.pit.t = 0; this.side = 0; }
    }

    // ---------------------------------------------------------------- helicopter
    stepHeli(dt, night, running) {
      const p = this.g.player;
      if (!this.heliOn) {
        if (running && night > 0.3) this.heliCool -= dt;
        if (this.heliCool <= 0 && running) {
          this.heliOn = true;
          this.heliT = 15;
          this.spotX = p.x > 0 ? -C.EDGE : C.EDGE;
          this.g.say('heli');
        }
      }
      const show = this.heliOn;
      this.heli.group.visible = this.beam.visible = this.spot.visible = show;
      this.lit = false;
      if (!show) { EZ.Audio.rotorLevel(0); return; }
      this.heliT -= dt;
      if (this.heliT <= 0 || !running || p.jammer > 0) {
        this.heliOn = false;
        this.heliCool = EZ.rand(32, 48);
        this.heli.group.visible = this.beam.visible = this.spot.visible = false;
        EZ.Audio.rotorLevel(0);
        return;
      }
      // spotlight crawls toward you; keep changing lanes to stay out of it
      const target = p.x;
      const maxV = 4.2;
      this.spotX += EZ.clamp(target - this.spotX, -maxV * dt, maxV * dt);
      const sz = -(p.s + 1.5);
      this.spot.position.set(this.spotX, 0.06, sz);
      const hx = this.spotX * 0.4 + Math.sin(this.g.time * 0.7) * 3, hy = 24, hz = sz - 26;
      this.heli.group.position.set(hx, hy, hz);
      this.heli.group.rotation.set(0.12, Math.sin(this.g.time * 0.4) * 0.15, Math.sin(this.g.time * 0.9) * 0.05);
      this.heli.rotor.rotation.y += dt * 38;
      this.heli.tail.rotation.x += dt * 50;
      this.heli.beacon.visible = (this.g.time * 1.5) % 1 < 0.2;
      const from = new T.Vector3(hx, hy - 1.2, hz);
      const to = new T.Vector3(this.spotX, 0, sz);
      const dir = new T.Vector3().subVectors(to, from);
      this.beam.position.copy(from);
      this.beam.scale.set(1, dir.length(), 1);
      this.beam.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dir.normalize());
      this.lit = !p.stunt && Math.abs(p.x - this.spotX) < 2.5;
      const fadeIn = EZ.clamp((15 - this.heliT) / 1.5, 0, 1) * EZ.clamp(this.heliT / 1.5, 0, 1);
      this.spot.material.opacity = 0.9 * fadeIn;
      this.beam.material.opacity = 0.06 * fadeIn;
      if (fadeIn < 0.6) this.lit = false;
      EZ.Audio.rotorLevel(0.9 * fadeIn);
    }

    // ---------------------------------------------------------------- lights
    flashLights(t, night, gap) {
      const phase = Math.floor(t * 9) % 6;
      const red = phase === 0 || phase === 2, blue = phase === 3 || phase === 5;
      const m = this.mats;
      m.copRed.color.setHex(red ? 0xff3348 : 0x4a0a12);
      m.copBlue.color.setHex(blue ? 0x5a84ff : 0x0b1640);
      const g = 0.25 + night * 0.75;
      m.copGlowRed.opacity = red ? g : 0;
      m.copGlowBlue.opacity = blue ? g : 0;
      const lead = this.chase[0];
      if (lead && lead.id >= 0) {
        const near = EZ.clamp(1 - gap / 40, 0, 1);
        const amt = (0.6 + night * 2.4) * (0.25 + near * 0.75);
        this.lightR.position.set(lead.x - 0.5, 2.2, -lead.s);
        this.lightB.position.set(lead.x + 0.5, 2.2, -lead.s);
        this.lightR.intensity = red ? amt : 0;
        this.lightB.intensity = blue ? amt : 0;
      } else {
        this.lightR.intensity = this.lightB.intensity = 0;
      }
      return red ? 'red' : blue ? 'blue' : '';
    }

    // ---------------------------------------------------------------- the end of the line
    bust(reason) {
      const p = this.g.player;
      this.cancelPit();
      this.heliT = Math.min(this.heliT, 3);
      // two more units box you in
      const pool = this.g.ents.pools.cruiser;
      const sx = p.x > 0 ? -1 : 1;
      const ahead = { id: pool.alloc(), s: p.s + 26, x: p.x + 4 * sx, dx: 0.4 * sx, off: 6.8, yaw: 1.2 * sx };
      const side = { id: pool.alloc(), s: p.s - 18, x: p.x + 4 * sx, dx: 2.4 * sx, off: 0.4, yaw: 0 };
      this.extra = [ahead, side].filter((c) => c.id >= 0);
      this.bustReason = reason;
    }
    bustStep(dt, t) {
      const p = this.g.player;
      if (this.pit) this.stepPit(dt, p);
      const pool = this.g.ents.pools.cruiser;
      const k = 1 - Math.exp(-2.4 * dt);
      for (const c of this.extra) {
        c.s += (p.s + c.off - c.s) * k;
        c.x += (p.x + c.dx - c.x) * k;
        pool.set(c.id, c.x, 0, -c.s, c.yaw * EZ.smoothstep(0, 1, t / 1.4), 0, 0, 1);
      }
      // the lead car closes the gap and stops on your bumper
      for (const c of this.chase) {
        if (c.id < 0) continue;
        const target = p.s - C.P_HL - 2.6 - c.lag * 0.25;
        c.s += (target - c.s) * k;
        c.x += (p.x + c.side * 0.8 - c.x) * k;
        pool.set(c.id, c.x, 0, -c.s, c.yaw, 0, 0, 1);
      }
    }
    clearExtra() {
      const pool = this.g.ents.pools.cruiser;
      for (const c of this.extra) if (c.id >= 0) pool.release(c.id);
      this.extra = [];
    }
  }

  EZ.Police = Police;
})();
