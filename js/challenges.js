/* Zero Sixty: set pieces that play out over time instead of waiting on the road. Crosswind
   gusts, police drones dropping EMP mines, cargo falling off a flatbed, toll arms that slam
   shut, the rolling block's weave and the wireless charging lane. The planner schedules them
   as it lays out the road; this runs them when you get there. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE, C = EZ.C, G = EZ.Geo;
  const PI = Math.PI;
  const RED = new T.Color(0xff3048), BLUE = new T.Color(0x5ab4ff), DIM = new T.Color(0x1a2a3a);
  const SNOW = new T.Color(0xf2f6f8), GRIT = new T.Color(0x9a9890), SPARK = new T.Color(0x9fd4ff);
  const _c = new T.Color();

  class Challenges {
    constructor(game) {
      this.g = game;
      const scene = game.scene, Mo = EZ.Models;
      this.drones = [0, 1, 2].map((i) => {
        const d = Mo.drone();
        d.group.visible = false;
        scene.add(d.group);
        return Object.assign(d, { i, on: false, x: 0, y: 16, rel: -20, tx: 0, ty: 5.6, trel: 24, dive: 0, bob: i * 2.1 });
      });
      this.rings = new EZ.Pool(scene, Mo.empRing(), 16);
      const tex = G.stripTexture();
      this.strips = [0, 1].map(() => {
        const t = tex.clone();
        t.needsUpdate = true;
        const mat = new T.MeshBasicMaterial({
          map: t, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        });
        const mesh = new T.Mesh(new T.PlaneGeometry(1.9, 1).rotateX(-PI / 2), mat);
        mesh.visible = false;
        scene.add(mesh);
        return { mesh, tex: t, zone: null };
      });
      this.mines = [];
      this.reset();
    }

    reset() {
      this.zones = [];
      this.gust = null;
      this.dr = null;
      for (const d of this.drones) { d.on = false; d.group.visible = false; }
      for (const m of this.mines) this.rings.release(m.ring);
      this.mines = [];
      this.rings.flush();
      for (const st of this.strips) { st.zone = null; st.mesh.visible = false; }
      this.charging = false;
      this.chargeT = 0;
      this.said = {};
      if (EZ.UI.el) EZ.UI.gust(0);
    }
    schedule(z) {
      this.zones.push(z);
      this.zones.sort((a, b) => a.s0 - b.s0);
    }
    // stretches where the PIT cruisers hang back so a set piece gets the road to itself
    quiet(s0, s1) { this.schedule({ type: 'quiet', s0, s1 }); }
    isQuiet(s) {
      for (const z of this.zones) if (z.type === 'quiet' && s >= z.s0 && s <= z.s1) return true;
      return false;
    }
    get hot() { return !!this.dr || !!this.gust; }

    // ---------------------------------------------------------------- per frame (during a run)
    update(dt) {
      const p = this.g.player;
      if (this.g.frame % 30 === 0) this.zones = this.zones.filter((z) => z.s1 > p.s - 150 || z.mesh);
      let wind = null, drones = null;
      for (const z of this.zones) {
        if (z.type === 'wind' && p.s >= z.s0 && p.s <= z.s1) wind = z;
        else if (z.type === 'drones' && p.s >= z.s0 - 90 && p.s <= z.s1) drones = z;
      }
      this.updateWind(dt, wind);
      this.updateDrones(dt, drones);
      this.updateMines(dt);
      this.updateWatched(dt);
      this.updateStrips(dt);
    }

    // after a bust the drones leave and the warnings go quiet
    bustStep(dt) {
      if (this.gust) { this.gust = null; EZ.UI.gust(0); }
      this.updateDrones(dt, null);
      this.updateMines(dt);
      this.charging = false;
    }

    // ---------------------------------------------------------------- crosswinds
    updateWind(dt, z) {
      const g = this.g, p = g.player;
      if (!z) {
        if (this.gust) { this.gust = null; EZ.UI.gust(0); }
        return;
      }
      if (!this.gust || this.gust.zone !== z) {
        this.gust = { zone: z, t: 1.7, warned: false };
        g.say('wind', {}, true);
      }
      const gs = this.gust;
      gs.t -= dt;
      if (!gs.warned && gs.t < 0.9) {
        // the warning: a wall of dust rolling in from the windward side, and the sock snapping straight
        gs.warned = true;
        EZ.Audio.gustWarn();
        EZ.UI.gust(z.dir);
        const key = g.world.chunkBiome(p.s).key;
        if (key === 'mojave' || key === 'pacific') this.tumbleweeds(z.dir);
      }
      if (gs.warned && gs.t > 0) {
        const col = this.dustColor();
        for (let i = 0; i < 3; i++) {
          g.fx.gust(-z.dir * EZ.rand(6.5, 9.5), EZ.rand(0.2, 2.4), -(p.s + EZ.rand(4, 46)), z.dir * EZ.rand(15, 22), -p.speed * 0.05, col);
        }
      }
      if (gs.t <= 0) {
        this.blow(z.dir);
        EZ.UI.gust(0);
        gs.t = EZ.lerp(2.3, 1.55, z.d) + EZ.rand(0, 0.7);
        gs.warned = false;
      }
    }
    blow(dir) {
      const g = this.g, p = g.player, r = g.run;
      EZ.Audio.gust();
      const col = this.dustColor();
      for (let i = 0; i < 26; i++) g.fx.gust(p.x - dir * EZ.rand(1, 7), EZ.rand(0.1, 2), -(p.s + EZ.rand(-4, 14)), dir * EZ.rand(16, 24), -p.speed * 0.2, col);
      g.shake = Math.max(g.shake, 0.18);
      if (p.crashed || p.inTube || p.onDeck || g.state !== 'run') return;
      if (p.lowered) {
        // suspension down, fans pulling: the car stays planted
        g.addCombo();
        const pts = Math.round(40 * r.mult);
        r.score += pts;
        p.boost = Math.min(1, p.boost + 0.05);
        p.vx += dir * 1.2;
        p.wobble = 0.12;
        EZ.UI.pop(`Held the line +${pts}`, 'trick');
        return;
      }
      if (p.air || p.rolling) { p.vx += dir * 4; return; }
      const l = p.lane + dir;
      g.breakCombo();
      g.vibrate(30);
      if (l >= 0 && l < C.LANES) {
        p.prevLane = p.lane;
        p.lane = l;
        p.vx += dir * 5;
        p.wobble = 0.35;
        EZ.UI.pop('Blown a lane over', 'bad');
        return;
      }
      // already in the outside lane: the gust puts you into the barrier
      p.vx = dir * 3;
      p.wobble = 0.4;
      p.stumble = 0.7;
      p.scrape = 0.5;
      p.scrapeSide = dir;
      r.gap -= 9;
      EZ.Audio.scrape();
      g.fx.sparks(p.x + dir * 0.95, 0.5, -p.s, dir * 2, -p.speed * 0.2, 18);
      EZ.UI.pop('Blown into the barrier', 'bad');
      g.shake = 0.45;
      if (r.gap <= 0) g.bust('caught');
    }
    tumbleweeds(dir) {
      const g = this.g, p = g.player;
      const n = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const vx = dir * EZ.rand(9, 12);
        g.ents.make({
          kind: 'tumble', pool: 'tumble', type: 'soft', mode: 'free', x: -dir * 8.2, y: 0.5, ground: 0.5, s: p.s + EZ.rand(38, 70), M: 0, k: 0,
          vs: 0, vx, vy: 2.5, decel: 0, vxDecay: 0.05, keepRoll: true, rollV: -vx / 0.5, pitchV: 0, life: 2.6, hw: 0.5, hl: 0.5, y1: 0.5, y0: -0.5,
        });
      }
    }
    dustColor() {
      const key = this.g.world.chunkBiome(this.g.player.s).key;
      return key === 'sierra' ? SNOW : key === 'downtown' ? GRIT : this.g.fx.c.dust;
    }

    // ---------------------------------------------------------------- drones and EMP mines
    updateDrones(dt, z) {
      const g = this.g, p = g.player;
      let D = this.dr;
      if (z && (!D || D.zone !== z) && g.state === 'run') {
        const n = z.d > 0.5 ? 3 : 2;
        D = this.dr = { zone: z, phase: 'in', t: 0, next: 1.6, safe: p.lane };
        this.drones.forEach((d, i) => {
          Object.assign(d, { on: i < n, x: EZ.laneX(i % 3) * 0.5, y: 19 + i * 2, rel: -34 - i * 8, trel: 21 + i * 4.5, tx: EZ.laneX(i % 3), ty: 5.3 + (i % 2) * 0.9, dive: 0 });
          d.group.visible = d.on;
        });
        g.say('drones', {}, true);
        EZ.Audio.droneIn();
      }
      if (!D) return;
      D.t += dt;
      const live = this.drones.filter((d) => d.on);
      if (D.phase === 'in' && D.t > 1.3) D.phase = 'hunt';
      if (D.phase === 'hunt') {
        const done = !z || p.s > z.s1 - p.speed * 1.3;
        if (done || p.jammer > 0 || g.state !== 'run') {
          D.phase = 'out';
          D.t = 0;
          if (p.jammer > 0) EZ.UI.pop('Drones lost you', 'good');
        } else {
          D.next -= dt;
          if (D.next <= 0) {
            this.dropRow(D, z, live);
            D.next = EZ.lerp(1.0, 0.66, z.d) + EZ.rand(0, 0.18);
          }
        }
      }
      if (D.phase === 'out') {
        for (const d of live) { d.ty = 28; d.trel = 95; }
        if (D.t > 2.4) {
          for (const d of this.drones) { d.on = false; d.group.visible = false; }
          this.dr = null;
          return;
        }
      }
      for (const d of live) {
        const k = 1 - Math.exp(-(D.phase === 'in' ? 2.4 : 3.6) * dt);
        d.x += (d.tx - d.x) * k;
        d.y += (d.ty - d.y) * k * 0.8;
        d.rel += (d.trel - d.rel) * k;
        d.dive = Math.max(0, d.dive - dt * 2.5);
      }
    }
    // One row of mines across the road. There's always a clear lane, and it never moves more
    // than one lane from one row to the next.
    dropRow(D, z, live) {
      const p = this.g.player;
      const cnt = z.d > 0.45 && Math.random() < 0.55 ? 2 : 1;
      const mined = EZ.shuffle(EZ.LANES.filter((l) => l !== D.safe)).slice(0, cnt);
      const target = p.s + Math.max(p.speed, 25) * 1.2 + 6;
      const used = [];
      for (const l of mined) {
        const x = EZ.laneX(l);
        let best = null;
        for (const d of live) if (!used.includes(d) && (!best || Math.abs(d.x - x) < Math.abs(best.x - x))) best = d;
        if (!best) best = live[0];
        used.push(best);
        best.tx = x;
        best.dive = 1;
        this.launchMine(best, l, target);
      }
      for (const d of live) if (!used.includes(d)) d.tx = EZ.laneX(EZ.randi(0, C.LANES - 1));
      D.safe = EZ.clamp(D.safe + EZ.pick([-1, 0, 1]), 0, C.LANES - 1);
    }
    launchMine(d, lane, target) {
      const g = this.g, p = g.player;
      const e = g.ents.make({ kind: 'mine', pool: 'mine', type: 'decor', mode: 'rel', lane, x: d.x, y: d.y - 0.6, s: p.s + d.rel, M: target, k: 0, hw: 1.2, hl: 1.0, y0: 0, y1: 0.3 });
      if (!e) return;
      e.moving = true;
      this.mines.push({ e, t: 0, x0: e.x, y0: e.y, s0: e.s, x1: EZ.laneX(lane), s1: target, ring: this.rings.alloc(), armed: false });
      EZ.Audio.mineDrop();
    }
    updateMines(dt) {
      const g = this.g, p = g.player, t = g.time;
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const m = this.mines[i], e = m.e;
        if (e.dead || m.s1 < p.s - 30) {
          this.rings.release(m.ring);
          this.mines.splice(i, 1);
          continue;
        }
        if (!m.armed) {
          m.t = Math.min(1, m.t + dt / 0.42);
          e.x = EZ.lerp(m.x0, m.x1, m.t);
          e.s = EZ.lerp(m.s0, m.s1, m.t);
          e.y = EZ.lerp(m.y0, 0, m.t * m.t);
          e.yaw += dt * 9;
          if (m.t >= 1) {
            m.armed = true;
            Object.assign(e, { mode: 'meet', M: m.s1, s: m.s1, prevS: m.s1, x: m.x1, prevX: m.x1, y: 0, type: 'emp' });
            EZ.Audio.mineArm();
            g.fx.sparks(m.x1, 0.15, -m.s1, 0, 0, 8, SPARK);
          }
        } else if (e.type === 'emp') {
          e.yaw += dt * 3;
        }
        // the ring: red while the mine falls, pulsing blue once it's armed, dark once it has fired
        if (m.ring >= 0) {
          const pulse = m.armed ? 0.7 + 0.3 * Math.sin(t * 14 + i) : 0.45 + 0.55 * m.t;
          _c.copy(!m.armed ? RED : e.type === 'emp' ? BLUE : DIM).multiplyScalar(pulse);
          this.rings.tint(m.ring, _c);
          this.rings.set(m.ring, m.x1, 0.05, -m.s1, t * 0.8, 0, 0, m.armed ? 1 : EZ.lerp(1.7, 1, m.t));
        }
      }
      this.rings.flush();
    }

    // ---------------------------------------------------------------- things that move on their own
    updateWatched(dt) {
      const g = this.g, ents = g.ents;
      let w = 0;
      for (const e of ents.watched) {
        if (e.dead) continue;
        ents.watched[w++] = e;
        if (e.kind === 'gate') this.gate(e, dt);
        else if (e.kind === 'cruiser') {
          // the rolling block weaves to cover the gaps between lanes
          if (e.mode === 'meet') e.x = EZ.laneX(e.lane) + Math.sin(g.time * 1.3 + e.weave) * 0.28;
        } else if (e.kind === 'car') this.flatbed(e, dt);
        else if (e.kind === 'cargo' && e.tip != null) {
          e.tip = Math.max(0, e.tip - dt);
          e.pitch = (PI / 2) * (e.tip / 0.28);
          if (e.tip <= 0) e.tip = null;
        } else if (e.kind === 'sock') {
          e.moving = true;
          if (e.baseYaw == null) e.baseYaw = e.yaw;
          e.yaw = e.baseYaw + Math.sin(g.time * 7 + e.M) * 0.08;
        }
      }
      ents.watched.length = w;
    }
    // An open toll lane whose arm comes down as you get close.
    gate(e, dt) {
      const p = this.g.player;
      if (!e.shut) {
        const ttm = (e.s - e.hl - (p.s + C.P_HL)) / Math.max(10, p.speed);
        if (ttm > 1.15) return;
        e.shut = true;
        e.moving = true;
        EZ.Audio.gate();
        const sig = e.group && e.group[e.sigRole];
        if (sig && !sig.dead) this.g.ents.repool(sig, 'tollStop');
      }
      if (e.roll > 0) {
        e.roll = Math.max(0, e.roll - dt * 5.2);
        if (e.roll < 0.4) e.type = 'low';
      }
    }
    // The flatbed sheds its load from the back as you close in.
    flatbed(host, dt) {
      const g = this.g, p = g.player, grp = host.group;
      if (!grp || grp.kind !== 'cargo' || host.mode !== 'meet' || g.state !== 'run') return;
      grp.dropT -= dt;
      if (grp.next >= grp.items.length || grp.dropT > 0) return;
      const gap = host.s - host.hl - (p.s + C.P_HL);
      if (gap > 90 || gap < 32) return;
      const e = grp.items[grp.next++];
      grp.dropT = 0.27;
      if (!e || e.dead) return;
      const drum = e.cargo === 'drum';
      const away = grp.other > 1 ? 1 : -1;
      Object.assign(e, { mode: 'free', type: 'hard', near: true, moving: true, vs: host.k * p.speed * 0.85, vy: EZ.rand(1.6, 3.2), decel: 10 });
      if (drum) Object.assign(e, { vx: away * EZ.rand(3.0, 3.6), vxDecay: 0.75, keepRoll: true, tip: 0.28, pitchV: 0 });
      else Object.assign(e, { vx: away * EZ.rand(0.2, 1.1) + EZ.rand(-0.3, 0.3), pitchV: EZ.rand(-7, -3), rollV: EZ.rand(-3, 3) });
      if (grp.next === 1) {
        g.say('cargo', {}, true);
        EZ.Audio.snap();
      }
      EZ.Audio.thud(3);
    }

    // ---------------------------------------------------------------- wireless charging lane
    updateStrips(dt) {
      const g = this.g, p = g.player, r = g.run;
      for (const z of this.zones) {
        if (z.type !== 'strip' || z.mesh || z.s0 > p.s + C.VIEW || z.s1 < p.s - 40) continue;
        const st = this.strips.find((x) => !x.zone);
        if (!st) continue;
        const len = z.s1 - z.s0;
        st.zone = z;
        z.mesh = st;
        st.mesh.scale.z = len;
        st.mesh.position.set(EZ.laneX(z.lane), 0.025, -(z.s0 + z.s1) / 2);
        st.tex.repeat.set(1, len / 4);
        st.mesh.visible = true;
      }
      let on = false;
      for (const st of this.strips) {
        const z = st.zone;
        if (!z) continue;
        if (z.s1 < p.s - 60) { z.mesh = null; st.zone = null; st.mesh.visible = false; continue; }
        st.tex.offset.y -= dt * 1.1;
        st.mesh.material.opacity = 0.62 + 0.2 * Math.sin(g.time * 5);
        if (p.s >= z.s0 && p.s <= z.s1 && Math.abs(p.x - EZ.laneX(z.lane)) < 1.1 && !p.air && !p.crashed && p.y < 0.2) on = true;
      }
      if (on && g.state === 'run') {
        p.battery = Math.min(100, p.battery + 9 * dt);
        p.boost = Math.min(1, p.boost + 0.07 * dt);
        r.score += 20 * dt * r.mult;
        this.chargeT += dt;
        if (!this.charging) EZ.Audio.chargeOn();
        if (this.chargeT > 1.2 && !this.said.charge) {
          this.said.charge = true;
          EZ.UI.pop('Wireless charging', 'good');
          g.say('charging');
        }
      }
      this.charging = on;
    }

    // ---------------------------------------------------------------- visuals (every frame)
    render(dt) {
      const p = this.g.player, t = this.g.time;
      for (const d of this.drones) {
        if (!d.on) continue;
        const bob = Math.sin(t * 2.2 + d.bob) * 0.25;
        d.group.position.set(d.x, d.y + bob - d.dive * 0.9, -(p.s + d.rel));
        d.group.rotation.set(-0.12 - d.dive * 0.25, Math.sin(t * 0.7 + d.bob) * 0.2, (d.tx - d.x) * -0.08);
        for (const r of d.rotors) r.rotation.y += dt * 46;
        d.pod.material.color.setHex((t * 3 + d.bob) % 1 < 0.5 ? 0x8fd0ff : 0x2a5a8a);
      }
    }
  }

  EZ.Challenges = Challenges;
})();
