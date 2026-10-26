/* Zero Sixty: traffic, hazards, charge cells and the planner that lays out the road ahead.

   Positions use "meet space". Every object has a meet point M: the distance along the road
   where your car reaches it. Traffic in lane L drives at LANE_K[L] of your speed, so its real
   position is  s = M * (1 - k) + k * playerS. That stays exact when you boost or stumble,
   which lets the planner guarantee every row has a way through. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE, C = EZ.C;
  const PI = Math.PI;
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _p = new T.Vector3(), _s = new T.Vector3(), _c = new T.Color();
  const ZERO = new T.Matrix4().makeScale(0, 0, 0);

  // ---------------------------------------------------------------- instanced pool
  class Pool {
    constructor(scene, parts, cap) {
      this.cap = cap;
      this.meshes = [];
      this.tinted = [];
      for (const p of parts) {
        const mesh = new T.InstancedMesh(p.geo, p.mat, cap);
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, ZERO);
        if (p.tint) {
          for (let i = 0; i < cap; i++) mesh.setColorAt(i, _c.set(0xffffff));
          this.tinted.push(mesh);
        }
        if (p.mat.transparent) mesh.renderOrder = 2;
        scene.add(mesh);
        this.meshes.push(mesh);
      }
      this.free = [];
      for (let i = cap - 1; i >= 0; i--) this.free.push(i);
      // only draw up to the highest slot in use: hidden slots would still cost vertex work
      this.used = new Uint8Array(cap);
      this.high = 0;
      this.dirty = true;
      this.colorDirty = true;
    }
    alloc() {
      if (!this.free.length) return -1;
      const id = this.free.pop();
      this.used[id] = 1;
      if (id + 1 > this.high) this.high = id + 1;
      return id;
    }
    release(id) {
      if (id < 0) return;
      for (const m of this.meshes) m.setMatrixAt(id, ZERO);
      this.used[id] = 0;
      this.free.push(id);
      while (this.high > 0 && !this.used[this.high - 1]) this.high--;
      this.dirty = true;
    }
    set(id, x, y, z, yaw = 0, pitch = 0, roll = 0, sc = 1) {
      _e.set(pitch, yaw, roll, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc, sc));
      for (const m of this.meshes) m.setMatrixAt(id, _m);
      this.dirty = true;
    }
    hide(id) { for (const m of this.meshes) m.setMatrixAt(id, ZERO); this.dirty = true; }
    tint(id, color) {
      if (!this.tinted.length) return;
      _c.set(color);
      for (const m of this.tinted) m.setColorAt(id, _c);
      this.colorDirty = true;
    }
    flush() {
      if (this.dirty) {
        // an empty pool costs nothing: no draw call at all
        for (const m of this.meshes) { m.instanceMatrix.needsUpdate = true; m.count = this.high; m.visible = this.high > 0; }
        this.dirty = false;
      }
      if (this.colorDirty) { for (const m of this.tinted) m.instanceColor.needsUpdate = true; this.colorDirty = false; }
    }
  }
  EZ.Pool = Pool;

  const TRAFFIC_COLORS = [0xc9ccd0, 0x2a2d33, 0xeeeeea, 0x7a1f24, 0x2b3f63, 0x5f6b5a, 0xc7b79a, 0x8a8f96, 0x3d4a5c, 0xa33a2a, 0x1f4d3a];

  // ---------------------------------------------------------------- entities
  class Entities {
    constructor(game) {
      this.g = game;
      const scene = game.scene, Mo = EZ.Models;
      this.defs = Object.assign({}, Mo.trafficKinds(), { cruiser: Mo.cruiserParts() }, Mo.staticKinds(), Mo.challengeKinds());
      const caps = {
        sedan: 14, hatch: 12, suv: 10, pickup: 8, box: 6, semi: 4, flatbed: 2, carrier: 2, cruiser: 16,
        barrier: 32, cone: 80, spikes: 12, lowbar: 3, trailer: 2, tractor: 2, arrowL: 3, arrowR: 3,
        toll: 2, gate: 6, tollGo: 4, tollStop: 5, crate: 10, drum: 8, tumble: 8, windsock: 3, mine: 14,
      };
      this.pools = {};
      for (const k in caps) this.pools[k] = new Pool(scene, this.defs[k].parts, caps[k]);
      this.pools.volt = new Pool(scene, Mo.voltParts(), 220);
      this.pools.blinker = new Pool(scene, [{ geo: new T.BoxGeometry(0.2, 0.14, 0.06), mat: Mo.mats().amber }], 8);
      this.pickupMeshes = [];
      for (const kind of ['charge', 'coil', 'jammer', 'shield', 'hover']) {
        for (let i = 0; i < 2; i++) {
          const p = Mo.pickup(kind);
          p.group.visible = false;
          scene.add(p.group);
          this.pickupMeshes.push(Object.assign({ kind, used: false }, p));
        }
      }
      this.tubes = [0, 1].map(() => {
        const t = Mo.suctionTube();
        scene.add(t.group);
        return Object.assign(t, { used: false });
      });
      this.list = [];
      this.volts = [];
      this.cars = [];
      this.watched = [];
      this.queue = [];
      this.t = 0;
      this.planner = new Planner(this);
    }

    reset() {
      for (const e of this.list) this.kill(e);
      this.list.length = 0;
      this.volts.length = 0;
      this.cars.length = 0;
      this.watched.length = 0;
      this.queue.length = 0;
      this.planner.reset();
      for (const k in this.pools) this.pools[k].flush();
    }

    enqueue(desc) {
      const lead = desc.k > 0 ? C.TRAFFIC_VIEW / (1 - desc.k) : C.VIEW;
      desc.at = desc.M - lead;
      let i = this.queue.length;
      while (i > 0 && this.queue[i - 1].at > desc.at) i--;
      this.queue.splice(i, 0, desc);
    }
    spawnDue(sp) {
      while (this.queue.length && this.queue[0].at <= sp) {
        const d = this.queue.shift();
        if (d.M > sp - 4) this.make(d);
      }
    }

    make(desc) {
      const def = desc.pool ? this.defs[desc.pool] : null;
      const e = Object.assign({
        type: 'hard', mode: 'meet', k: 0, x: 0, y: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
        hw: def ? def.hw : 1, hl: def ? def.hl : 1, y0: 0, y1: def ? def.h : 1,
        id: -1, blinkId: -1, dead: false, passed: false, minClear: 99, overS: false, hidden: false,
      }, desc);
      if (e.pool) {
        const pool = this.pools[e.pool];
        e.id = pool.alloc();
        if (e.id < 0) return null;
        if (e.color != null) pool.tint(e.id, e.color);
      }
      if (e.kind === 'pickup') {
        const pm = this.pickupMeshes.find((p) => p.kind === e.pickup && !p.used);
        if (!pm) return null;
        pm.used = true;
        pm.group.visible = true;
        e.pm = pm;
      }
      if (e.kind === 'tube') {
        const tm = this.tubes.find((t) => !t.used);
        if (!tm) return null;
        tm.used = true;
        tm.group.visible = true;
        e.tm = tm;
      }
      if (e.mode === 'meet') e.s = e.M * (1 - e.k) + e.k * this.g.player.s;
      e.prevS = e.s;
      e.prevX = e.x;
      e.moving = e.mode !== 'meet' || e.k > 0 || !!e.cut || e.kind === 'volt' || e.kind === 'pickup';
      this.list.push(e);
      if (e.kind === 'volt') this.volts.push(e);
      if (e.kind === 'car') this.cars.push(e);
      // set pieces made of several entities find each other through their group
      if (e.group) {
        if (e.role) e.group[e.role] = e;
        if (e.item) e.group.items.push(e);
      }
      if (e.watch) this.watched.push(e);
      this.draw(e);
      if (e.onSpawn) e.onSpawn(e);
      return e;
    }

    kill(e) {
      if (e.dead) return;
      e.dead = true;
      if (e.pool && e.id >= 0) this.pools[e.pool].release(e.id);
      if (e.blinkId >= 0) { this.pools.blinker.release(e.blinkId); e.blinkId = -1; }
      if (e.pm) { e.pm.used = false; e.pm.group.visible = false; e.pm = null; }
      if (e.tm) { e.tm.used = false; e.tm.group.visible = false; e.tm = null; }
    }
    // Swap an entity's model, keeping everything else about it.
    repool(e, pool) {
      if (e.pool && e.id >= 0) this.pools[e.pool].release(e.id);
      e.pool = pool;
      e.id = this.pools[pool].alloc();
      this.draw(e);
    }

    // Knock something loose: cones fly, wrecks spin.
    launch(e, vs, vx, vy, spin, life) {
      e.mode = 'free';
      e.moving = true;
      e.vs = vs; e.vx = vx; e.vy = vy; e.spin = spin;
      e.rollV = EZ.rand(-6, 6); e.pitchV = EZ.rand(-6, 6);
      if (life != null) e.life = life;
      e.decel = e.decel || 10;
    }
    // A crash knocks a vehicle loose. With opts.vy and roll it can leave the ground and flip.
    wreck(e, vs, opts = {}) {
      e.mode = 'free';
      e.moving = true;
      e.vs = vs;
      e.vx = opts.vx != null ? opts.vx : EZ.rand(-2.5, 2.5);
      e.vy = opts.vy || 0;
      e.rollV = opts.roll || 0;
      e.pitchV = opts.pitch || 0;
      e.spin = opts.spin != null ? opts.spin : EZ.rand(2.5, 4.5) * (Math.random() < 0.5 ? -1 : 1);
      e.decel = 16;
      e.wrecked = true;
      e.smoke = 3;
      e.cut = null;
    }
    // Everything keeps rolling at its current speed once the chase ends.
    freeze(vp) {
      for (const e of this.list) {
        if (e.dead || e.mode !== 'meet' || e.k === 0) continue;
        e.mode = 'free';
        e.vs = e.k * vp;
        e.vx = 0; e.spin = 0; e.decel = 0.4;
      }
    }

    step(h, sp, vp) {
      this.t += h;
      const p = this.g.player;
      for (const e of this.list) {
        if (e.dead) continue;
        e.prevS = e.s;
        e.prevX = e.x;
        if (e.mode === 'meet') {
          e.s = e.M * (1 - e.k) + e.k * sp;
          if (e.cut) this.cutIn(e, h, sp, vp);
        } else if (e.mode === 'free') {
          e.s += e.vs * h;
          e.x += e.vx * h;
          const gy = e.ground || 0;
          if (e.vy || e.y > gy + 0.01) {
            e.y += e.vy * h;
            e.vy -= 22 * h;
            if (e.y < gy) {
              e.y = gy;
              const hard = Math.abs(e.vy) > 2;
              if (hard && e.wrecked) this.g.fx.sparks(e.x, 0.1, -e.s, 0, e.vs * 0.3, 8);
              if (hard && e.kind === 'cargo') this.g.onCargoBounce(e, -e.vy);
              e.vy = hard ? -e.vy * 0.3 : 0;
            }
          }
          // on the ground a tumbling wreck settles onto its wheels or its roof
          if (e.y <= gy + 0.001 && (e.rollV || e.pitchV) && !e.keepRoll) {
            e.rollV *= Math.exp(-5 * h);
            e.pitchV *= Math.exp(-5 * h);
            e.roll = EZ.damp(e.roll, Math.round(e.roll / Math.PI) * Math.PI, 4, h);
            e.pitch = EZ.damp(e.pitch, Math.round(e.pitch / Math.PI) * Math.PI, 4, h);
          }
          // a drum rolls at whatever speed it's sliding sideways, and stops at the road edge
          if (e.keepRoll) {
            if (e.kind === 'cargo' && Math.abs(e.x) > C.EDGE) { e.x = Math.sign(e.x) * C.EDGE; e.vx = 0; }
            if (e.y <= gy + 0.001) e.rollV = -e.vx / 0.3;
          }
          e.vs = e.vs > 0 ? Math.max(0, e.vs - e.decel * h) : Math.min(0, e.vs + e.decel * h);
          e.vx *= Math.exp(-(e.vxDecay || 2.2) * h);
          e.yaw += (e.spin || 0) * h;
          e.spin = (e.spin || 0) * Math.exp(-1.1 * h);
          if (e.rollV) { e.roll += e.rollV * h; e.pitch += e.pitchV * h; }
          if (e.life != null) { e.life -= h; if (e.life <= 0) { this.kill(e); continue; } }
        } else if (e.mode === 'magnet') {
          e.s = EZ.damp(e.s, p.s + 0.5, 9, h);
          e.x = EZ.damp(e.x, p.x, 9, h);
          e.y = EZ.damp(e.y, p.y + 0.8, 9, h);
        }
        if (e.s + (e.len || 0) < sp - C.BEHIND - e.hl && e.mode !== 'rel') this.kill(e);
      }
    }

    cutIn(e, h, sp, vp) {
      const c = e.cut;
      const rel = e.s - e.hl - (sp + C.P_HL);
      const ttm = rel / Math.max(1, vp * (1 - e.k));
      if (!c.started) {
        e.blink = ttm < 3.0 ? c.to - c.from : 0;
        if (ttm < 1.8) { c.started = true; c.t = 0; }
      } else if (c.t < 1) {
        c.t = Math.min(1, c.t + h / 0.7);
        const nx = EZ.lerp(EZ.laneX(c.from), EZ.laneX(c.to), EZ.smoothstep(0, 1, c.t));
        const vx = (nx - e.x) / h;
        e.x = nx;
        e.yaw = -Math.atan2(vx, Math.max(6, vp * e.k)) * 0.7;
        if (c.t >= 1) { e.lane = c.to; e.blink = 0; e.yaw = 0; }
      }
    }

    draw(e) {
      if (e.tm) { e.tm.group.position.set(e.x, 0, -e.s); return; }
      if (e.kind === 'pickup' && e.pm) {
        e.pm.group.position.set(e.x, e.y + Math.sin(this.t * 3 + e.M) * 0.12, -e.s);
        e.pm.icon.rotation.y = this.t * 2.2;
        e.pm.ring.rotation.y = this.t * 1.2;
        e.pm.group.visible = !e.hidden;
        return;
      }
      if (!e.pool || e.id < 0) return;
      const pool = this.pools[e.pool];
      if (e.hidden) { pool.hide(e.id); return; }
      // a flipped vehicle pivots about its base, so lift it by its height when it's upside down
      const lift = e.wrecked ? e.y1 * (1 - Math.cos(e.roll) * Math.cos(e.pitch)) * 0.5 : 0;
      pool.set(e.id, e.x + (e.dx || 0), e.y + lift, -e.s, e.yaw, e.pitch, e.roll, e.scale);
    }

    render(dt) {
      const blinkOn = (this.t * 2.2) % 1 < 0.55;
      // charge cells hide while a car drives through them
      for (const v of this.volts) {
        if (v.dead) continue;
        v.yaw += dt * 2.6;
        let inside = false;
        for (const c of this.cars) {
          if (!c.dead && v.y < c.y1 && Math.abs(c.x - v.x) < c.hw + 0.3 && Math.abs(c.s - v.s) < c.hl + 0.4) { inside = true; break; }
        }
        v.hidden = inside;
      }
      let w = 0;
      for (let i = 0; i < this.list.length; i++) {
        const e = this.list[i];
        if (e.dead) continue;
        this.list[w++] = e;
        if (e.moving) this.draw(e);
        if (e.blink) {
          if (e.blinkId < 0) e.blinkId = this.pools.blinker.alloc();
          if (e.blinkId >= 0) {
            if (blinkOn) {
              const side = Math.sign(e.blink) * (e.hw - 0.12);
              this.pools.blinker.set(e.blinkId, e.x + side * Math.cos(e.yaw), 0.95, -(e.s - e.hl - 0.02), e.yaw);
            } else this.pools.blinker.hide(e.blinkId);
          }
        } else if (e.blinkId >= 0) {
          this.pools.blinker.release(e.blinkId);
          e.blinkId = -1;
        }
        if (e.smoke > 0) {
          e.smoke -= dt;
          if (Math.random() < 0.5) this.g.fx.smokeColumn(e.x, 1.2, -e.s, 1);
        }
      }
      this.list.length = w;
      let vw = 0;
      for (let i = 0; i < this.volts.length; i++) if (!this.volts[i].dead) this.volts[vw++] = this.volts[i];
      this.volts.length = vw;
      let cw = 0;
      for (let i = 0; i < this.cars.length; i++) if (!this.cars[i].dead) this.cars[cw++] = this.cars[i];
      this.cars.length = cw;
      for (const k in this.pools) this.pools[k].flush();
    }
  }

  // ---------------------------------------------------------------- planner
  const arc = (S) => (s) => 0.95 + 1.55 * Math.sin(PI * EZ.clamp((s - S + 12) / 24, 0, 1));
  const FLAVOUR = [
    ['RED ROADSTER', 'CALL 911'], ['SPEED LIMIT', '65 ALLEGEDLY'], ['DONT TEXT', 'AND EVADE'], ['MARS', '140M MILES'],
    ['BUCKLE UP', 'GETS WORSE'], ['NO EXIT', 'FOR YOU'], ['SMILE', 'YOU ARE LIVE'],
  ];

  class Planner {
    constructor(ents) {
      this.e = ents;
      this.reset();
    }
    reset() {
      this.S = 190;
      this.zone = 'warmup';
      this.zoneLeft = 3;
      this.zoneNo = 0;
      this.occ = EZ.LANES.map(() => []);
      this.trafficM = EZ.LANES.map(() => []);
      this.cutM = EZ.LANES.map(() => []);
      this.nextGuide = 480;
      this.nextFlavour = 1400;
      this.lastVMS = -1e9;
      this.tut = EZ.store.data.tutorial ? null : { hop: false, low: false };
      this.seen = {};
      this.pickupNext = 650;
      this.lastTube = -1e9;
      this.nextStrip = 1100;
      this.lastSpecial = '';
      // set pieces debut one at a time; after the first two the order changes every run
      this.debuts = ['carrier', 'tube', ...EZ.shuffle(['cargo', 'toll', 'wind', 'rolling', 'drones'])];
    }
    ch() { return this.e.g.ch; }
    world() { return this.e.g.world; }
    diff(S) { return EZ.clamp((S - 500) / 15000, 0, 1); }

    update(sp) {
      let guard = 0;
      while (this.S < sp + C.HORIZON && guard++ < 24) this.step();
      for (const l of this.occ) while (l.length && l[0][1] < sp - 200) l.shift();
      for (const l of this.trafficM) while (l.length && l[0] < sp - 200) l.shift();
      for (const l of this.cutM) while (l.length && l[0] < sp - 200) l.shift();
    }

    step() {
      const S = this.S, d = this.diff(S);
      if (this.zoneLeft <= 0) this.nextZone(d);
      let len = 0;
      switch (this.zone) {
        case 'warmup': len = this.trafficRow(S, 0, 1); break;
        case 'traffic': {
          const k = EZ.weighted([['row', 3], ['weave', 0.4 + d * 1.4], ['pair', 0.8]]);
          len = k === 'weave' ? this.weave(S, d) : k === 'pair' ? this.pair(S, d) : this.trafficRow(S, d);
          break;
        }
        case 'hazard': len = this.hazard(S, d); break;
        case 'police': len = this.roadblock(S, d); break;
        case 'works': len = this.works(S, d); break;
        case 'tube': len = this.tube(S, d); break;
        case 'carrier': len = this.carrier(S, d); break;
        case 'cargo': len = this.cargo(S, d); break;
        case 'toll': len = this.toll(S, d); break;
        case 'wind': len = this.wind(S, d); break;
        case 'rolling': len = this.rolling(S, d); break;
        case 'drones': len = this.drones(S, d); break;
      }
      if (this.zone === 'traffic' && S > this.nextStrip) this.strip(S);
      this.zoneLeft--;
      if (S > this.nextGuide) {
        if (Math.abs(S - this.lastVMS) > 130) this.world().addGantry('guide', S - 25, this.world().guideFor(S));
        this.nextGuide = S + EZ.rand(650, 980);
      }
      if (S > this.nextFlavour && this.zone === 'traffic') {
        if (Math.abs(S - this.lastVMS) > 200 && Math.abs(S - this.nextGuide) > 120) this.vms(S + 30, EZ.pick(FLAVOUR));
        this.nextFlavour = S + EZ.rand(1300, 2200);
      }
      const v = EZ.Player.baseSpeed(S);
      this.S = S + len + EZ.clamp(v * EZ.lerp(1.2, 0.82, d), 40, 95) + EZ.rand(0, 16);
    }

    nextZone(d) {
      this.zoneNo++;
      if (this.zone !== 'traffic') { this.zone = 'traffic'; this.zoneLeft = EZ.randi(3, 5); return; }
      if (this.tut && (!this.tut.hop || !this.tut.low)) { this.zone = 'hazard'; this.zoneLeft = 1; return; }
      const set = (z, n = 1) => { this.zone = z; this.zoneLeft = n; if (z !== 'hazard') this.lastSpecial = z; };
      // a new set piece every other special zone until you've seen them all
      const fresh = this.debuts.find((z) => !this.seen[z]);
      if (fresh && this.zoneNo >= 4 && (this.zoneNo % 4 === 0 || this.debuts.indexOf(fresh) < 2)) { set(fresh); return; }
      if (this.zoneNo > 7 && this.zoneNo % 8 === 0 && Math.random() < 0.85) { set('police'); return; }
      const mix = [['hazard', 3], ['works', 0.6]];
      for (const z of this.debuts) {
        if (!this.seen[z] || z === this.lastSpecial) continue;
        if (z === 'tube' && this.S - this.lastTube < 1600) continue;
        mix.push([z, z === 'tube' ? 0.45 : 0.75]);
      }
      const z = EZ.weighted(mix);
      if (z === 'hazard') set('hazard', EZ.randi(2, 3 + Math.round(d * 2)));
      else set(z);
    }

    // ---- bookkeeping
    block(lane, a, b) {
      const l = this.occ[lane];
      l.push([a, b]);
      l.sort((p, q) => p[1] - q[1]);
    }
    canTraffic(lane, M) {
      const k = EZ.LANE_K[lane], B = (C.TRAFFIC_VIEW * k) / (1 - k) + 10;
      for (const [a, b] of this.occ[lane]) if (b > M - B && a < M + 8) return false;
      for (const m of this.cutM[lane]) if (Math.abs(m - M) < 70) return false;
      return true;
    }
    trafficNear(lane, M, r) { return this.trafficM[lane].some((m) => Math.abs(m - M) < r); }
    vms(s, lines) {
      this.world().addGantry('vms', s, { lines });
      this.lastVMS = s;
    }
    car(lane, M, opts = {}) {
      const k = EZ.LANE_K[lane];
      let model = opts.model;
      if (!model) {
        model = Math.random() < (lane === 2 ? 0.3 : lane === 1 ? 0.1 : 0.04)
          ? EZ.weighted([['box', 2], ['semi', 1], ['pickup', 2]])
          : EZ.weighted([['sedan', 4], ['hatch', 2], ['suv', 2], ['pickup', 1]]);
      }
      const def = this.e.defs[model];
      this.trafficM[lane].push(M);
      if (opts.cut != null) this.cutM[opts.cut].push(M);
      this.e.enqueue({
        kind: 'car', model, pool: model, type: 'hard', lane, x: EZ.laneX(lane), k, M, y1: def.h,
        color: EZ.pick(TRAFFIC_COLORS), near: true,
        cut: opts.cut != null ? { from: lane, to: opts.cut, started: false, t: 0 } : null,
      });
    }
    stat(kind, lane, M, extra = {}) {
      const def = this.e.defs[kind];
      const desc = Object.assign({ kind, pool: kind, type: 'hard', lane, x: lane >= 0 ? EZ.laneX(lane) : 0, k: 0, M, y1: def ? def.h : 1 }, extra);
      this.e.enqueue(desc);
      const hw = desc.hw || (def ? def.hw : 1), hl = desc.hl || (def ? def.hl : 1);
      for (const l of EZ.LANES) {
        if (Math.abs(EZ.laneX(l) - desc.x) < hw + 1.7) this.block(l, M - hl - 2, M + hl + 2);
      }
      return desc;
    }
    volts(lane, a, b, yFn, k = 0) {
      for (let s = a; s <= b; s += 4.2) {
        this.e.enqueue({ kind: 'volt', pool: 'volt', type: 'volt', lane, x: EZ.laneX(lane), k, M: s, y: yFn ? yFn(s) : 0.95, hw: 0.45, hl: 0.45, y1: 0 });
      }
    }
    maybePickup(S, free) {
      if (S < this.pickupNext || !free.length || Math.random() > 0.4) return;
      const lane = EZ.pick(free);
      const kind = EZ.weighted([['charge', 1.3], ['coil', 1], ['jammer', 0.8], ['shield', 0.8], ['hover', 0.7]]);
      this.e.enqueue({ kind: 'pickup', pickup: kind, type: 'pickup', lane, x: EZ.laneX(lane), k: 0, M: S, y: 1.25, hw: 1.0, hl: 1.0, y1: 0 });
      this.pickupNext = S + EZ.rand(520, 950);
    }

    // ---- traffic patterns
    trafficRow(S, d, forceN) {
      let n = forceN || 1 + (Math.random() < 0.35 + d * 0.45 ? 1 : 0) + (Math.random() < d * 0.5 ? 1 : 0);
      const lanes = EZ.shuffle(EZ.LANES.slice()).filter((l) => this.canTraffic(l, S));
      n = Math.min(n, C.LANES - 1, lanes.length);
      const used = lanes.slice(0, n);
      let cut = null;
      if (n === 1 && d > 0.04 && Math.random() < 0.16 + d * 0.3) {
        const from = used[0];
        const opts = [from - 1, from + 1].filter((l) => l >= 0 && l < C.LANES && !used.includes(l) && this.canTraffic(l, S) && !this.trafficNear(l, S, 70));
        if (opts.length) cut = EZ.pick(opts);
      }
      used.forEach((l, i) => this.car(l, S + EZ.rand(-3, 3), i === 0 && cut != null ? { cut } : {}));
      const blocked = used.map((l, i) => (i === 0 && cut != null ? cut : l));
      const free = EZ.LANES.filter((l) => !blocked.includes(l));
      if (free.length && Math.random() < 0.7) this.volts(EZ.pick(free), S - 24, S + 8);
      this.maybePickup(S + 16, free);
      return 6;
    }
    pair(S, d) {
      // two cars side by side: you thread the gap or go around
      const a = EZ.randi(0, 1);
      if (this.canTraffic(a, S)) this.car(a, S);
      if (this.canTraffic(a + 1, S)) this.car(a + 1, S + EZ.rand(-1, 1));
      const free = EZ.LANES.filter((l) => l !== a && l !== a + 1);
      this.volts(EZ.pick(free), S - 20, S + 6);
      this.maybePickup(S + 16, free);
      return 6;
    }
    weave(S, d) {
      let f = EZ.randi(0, 2);
      const rows = 3, step = EZ.lerp(36, 28, d);
      for (let i = 0; i < rows; i++) {
        const M = S + i * step;
        const n = d > 0.35 ? 2 : 1;
        const others = EZ.shuffle(EZ.LANES.filter((l) => l !== f)).slice(0, n);
        for (const l of others) if (this.canTraffic(l, M)) this.car(l, M + EZ.rand(-1.5, 1.5));
        this.volts(f, M - 9, M + 9);
        f = EZ.clamp(f + (Math.random() < 0.5 ? -1 : 1), 0, 2);
      }
      return step * (rows - 1) + 6;
    }

    // ---- hazards
    hazard(S, d) {
      if (this.tut && !this.tut.hop) {
        this.tut.hop = true;
        this.vms(S - 150, ['THRUSTER HOP', EZ.touch ? 'SWIPE UP' : 'PRESS UP']);
        return this.barrierRow(S, d, 3);
      }
      if (this.tut && !this.tut.low) {
        this.tut.low = true;
        this.vms(S - 150, ['LOW CLEARANCE', EZ.touch ? 'SWIPE DOWN' : 'PRESS DOWN']);
        return this.lowBar(S, d);
      }
      const k = EZ.weighted([['barrier', 3], ['wall', 0.5 + d * 1.5], ['lowbar', 0.9 + d], ['trailer', 0.7 + d], ['spikes', 0.5 + d], ['stagger', 0.8 + d]]);
      if (k === 'wall') return this.barrierRow(S, d, 3);
      if (k === 'lowbar') return this.lowBar(S, d);
      if (k === 'trailer') return this.trailer(S, d);
      if (k === 'spikes') return this.spikes(S, d);
      if (k === 'stagger') return this.stagger(S, d);
      return this.barrierRow(S, d);
    }
    barrierRow(S, d, force) {
      const n = force || EZ.randi(1, 2);
      const lanes = EZ.shuffle(EZ.LANES.slice()).slice(0, n);
      for (const l of lanes) this.stat('barrier', l, S);
      const free = EZ.LANES.filter((l) => !lanes.includes(l));
      if (n === C.LANES || Math.random() < 0.5) this.volts(EZ.pick(lanes), S - 12, S + 12, arc(S));
      else if (free.length) this.volts(EZ.pick(free), S - 22, S + 8);
      this.maybePickup(S + 18, free);
      return 3;
    }
    stagger(S, d) {
      // two lanes blocked, then the lane you used is blocked: switch back across in 26 m
      const first = EZ.shuffle(EZ.LANES.slice()).slice(0, 2);
      for (const l of first) this.stat('barrier', l, S);
      const freeA = EZ.LANES.filter((l) => !first.includes(l));
      const keep = EZ.pick(first);
      const second = [freeA[0]];
      if (d > 0.5) second.push(first.find((l) => l !== keep));
      for (const l of second) this.stat('barrier', l, S + 26);
      this.volts(keep, S + 4, S + 22);
      return 30;
    }
    lowBar(S, d) {
      if (!this.seen.lowbar) {
        this.seen.lowbar = true;
        if (!this.tut) this.vms(S - 150, ['LOW CLEARANCE', 'RIDE LOW']);
      }
      this.stat('lowbar', -1, S, { x: 0.7, type: 'low', y0: C.CLEAR, y1: 1.45, hw: 8.1, hl: 0.16 });
      this.volts(EZ.randi(0, 2), S - 10, S + 10, () => 0.5);
      if (d > 0.4 && Math.random() < 0.4) {
        const lanes = EZ.shuffle(EZ.LANES.slice()).slice(0, 2);
        for (const l of lanes) this.stat('barrier', l, S + 30);
        return 32;
      }
      return 2;
    }
    trailer(S, d) {
      if (!this.seen.trailer) { this.seen.trailer = true; this.vms(S - 150, ['TRUCK CRASH', 'RIDE LOW']); }
      const dir = Math.random() < 0.5 ? 1 : -1;
      // the kingpin end sits over one edge of the road, the cab folded beside it
      const kx = dir > 0 ? -5.0 : 6.0, xc = kx + dir * 6.5, ax = xc + dir * 5.2;
      // the trailer itself: you can only pass under it with the suspension lowered
      this.stat('trailer', -1, S, { x: xc, yaw: dir > 0 ? 0 : PI, type: 'low', y0: C.CLEAR, y1: C.CLEAR + 2.6, hw: 6.5, hl: 1.25 });
      // rear axles hang under one end, the tractor is jackknifed against the other
      this.stat(null, -1, S, { pool: null, kind: 'axles', x: ax, type: 'hard', hw: 1.35, hl: 1.0, y1: C.CLEAR });
      this.stat('tractor', -1, S + 1.2, { x: kx, yaw: dir * 0.16, hw: 1.45, hl: 3.2, color: EZ.pick([0xc8102e, 0x1b4c8c, 0xf2f2ee, 0x2a2d33]) });
      // volts under the trailer, in a lane you can duck through
      const low = EZ.LANES.filter((l) => {
        const lx = EZ.laneX(l);
        const axle = Math.abs(lx - ax) < 1.35 + C.P_HW;
        const cab = Math.abs(lx - kx) < 1.45 + C.P_HW;
        return !axle && !cab;
      });
      if (low.length) this.volts(EZ.pick(low), S - 10, S + 10, () => 0.5);
      return 4;
    }
    spikes(S, d) {
      if (!this.seen.spikes) { this.seen.spikes = true; this.vms(S - 150, ['SPIKE STRIP', 'AHEAD']); }
      const n = EZ.randi(1, d > 0.4 ? 3 : 2);
      const lanes = EZ.shuffle(EZ.LANES.slice()).slice(0, n);
      for (const l of lanes) this.stat('spikes', l, S, { type: 'spike', y1: 0.09 });
      this.stat('cruiser', -1, S - 8, { x: 7.0, yaw: 0.22, type: 'hard', parked: true });
      const free = EZ.LANES.filter((l) => !lanes.includes(l));
      if (free.length) this.volts(EZ.pick(free), S - 18, S + 6);
      else this.volts(EZ.pick(lanes), S - 12, S + 12, arc(S));
      return 2;
    }
    roadblock(S, d) {
      this.vms(S - 175, ['ROADBLOCK', 'AHEAD']);
      const gap = EZ.randi(0, 2);
      for (const l of EZ.LANES) {
        if (l === gap) continue;
        this.stat('cruiser', l, S + EZ.rand(-1, 1), {
          yaw: (l < gap ? 1 : -1) * EZ.rand(1.15, 1.4), hw: 1.75, hl: 1.45, roadblock: true,
        });
      }
      if (d > 0.22 && Math.random() < 0.55) this.stat('spikes', gap, S - 10, { type: 'spike', y1: 0.09 });
      this.volts(gap, S - 34, S - 16);
      this.e.enqueue({ kind: 'marker', pool: null, type: 'none', M: S - 160 + C.VIEW, k: 0, x: 0, hw: 0, hl: 0, y1: 0, onSpawn: () => this.e.g.say('roadblock') });
      return 4;
    }
    // The suction tube: drive in, climb the wall, ride the ceiling, drop and land on thrusters.
    tube(S, d) {
      this.seen.tube = true;
      this.lastTube = S;
      this.vms(S - 165, ['SUCTION RAMP', 'DRIVE IN']);
      const cx = EZ.pick([-1.8, 1.8]);
      const L = C.TUBE_CLIMB + C.TUBE_CEIL;
      this.e.enqueue({ kind: 'tube', type: 'tube', pool: null, x: cx, k: 0, M: S, hw: 3.3, hl: 0.8, len: L, y1: 0 });
      for (const l of EZ.LANES) {
        if (Math.abs(EZ.laneX(l) - cx) < 2) this.block(l, S - 30, S + L + 95);
      }
      // charge cells on the approach and along the ceiling
      const lead = cx + (Math.random() < 0.5 ? -1.8 : 1.8);
      for (let s = S - 30; s < S - 6; s += 4.2) this.e.enqueue({ kind: 'volt', pool: 'volt', type: 'volt', lane: -1, x: lead, k: 0, M: s, y: 0.95, hw: 0.45, hl: 0.45, y1: 0 });
      for (let s = S + C.TUBE_CLIMB + 6; s < S + L - 4; s += 5) {
        this.e.enqueue({ kind: 'volt', pool: 'volt', type: 'volt', lane: -1, x: cx, k: 0, M: s, y: 2 * C.TUBE_R - 0.65, hw: 0.45, hl: 0.45, y1: 0 });
      }
      return L + 70;
    }
    works(S, d) {
      const right = Math.random() < 0.5;
      const closed = d > 0.3 && Math.random() < 0.5 ? (right ? [1, 2] : [0, 1]) : right ? [2] : [0];
      const L = 110;
      this.vms(S - 170, [closed.length > 1 ? 'TWO LANES CLOSED' : 'LANE CLOSED', right ? 'MERGE LEFT' : 'MERGE RIGHT']);
      const outer = right ? 2 : 0;
      this.stat(right ? 'arrowL' : 'arrowR', outer, S);
      const edge = right ? 6.6 : -6.2;
      const bx = right ? EZ.laneX(closed[0]) - 1.8 : EZ.laneX(closed[closed.length - 1]) + 1.8;
      // taper, then a straight line of cones along the closure
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        this.e.enqueue({ kind: 'cone', pool: 'cone', type: 'soft', x: EZ.lerp(edge, bx, t), k: 0, M: S - 36 + t * 30 });
      }
      for (let s = S + 6; s <= S + L; s += 7) this.e.enqueue({ kind: 'cone', pool: 'cone', type: 'soft', x: bx + (right ? 0.3 : -0.3), k: 0, M: s });
      for (const l of closed) {
        this.block(l, S - 38, S + L + 4);
        this.stat('barrier', l, S + L * 0.55);
        for (let i = 0; i < 3; i++) this.e.enqueue({ kind: 'cone', pool: 'cone', type: 'soft', x: EZ.laneX(l) + EZ.rand(-1, 1), k: 0, M: S + 15 + Math.random() * (L - 20) });
      }
      const open = EZ.LANES.filter((l) => !closed.includes(l));
      // one more thing to dodge inside the open lanes
      if (d > 0.15) this.stat('barrier', EZ.pick(open), S + L * 0.3);
      this.volts(EZ.pick(open), S + L * 0.6, S + L * 0.9);
      return L;
    }

    // ================================================================ set pieces
    // where something riding at speed share k sits when its host is at meet point M, ds further on
    static ride(M, ds, k) { return M + ds / (1 - k); }
    first(z) { const f = !this.seen[z]; this.seen[z] = true; return f; }
    clear(a, b) { for (const l of EZ.LANES) this.block(l, a, b); }

    // A car carrier with its rear deck down: drive up it, along the top and off the headrack.
    carrier(S0, d) {
      // the carrier sits 50 m into its own stretch so traffic planned earlier is out of the way
      const S = S0 + 50;
      const first = this.first('carrier');
      const lane = EZ.pick([1, 2]), k = EZ.LANE_K[lane], x = EZ.laneX(lane), CA = EZ.Models.CARRIER;
      this.vms(S - 175, first ? ['CAR CARRIER', 'DRIVE UP THE RAMP'] : ['CAR CARRIER', 'RAMP DOWN AHEAD']);
      this.clear(S0 - 30, S + 170);
      this.ch().quiet(S - 260, S + 140);
      const grp = { kind: 'carrier', items: [] };
      this.trafficM[lane].push(S);
      this.e.enqueue({
        kind: 'car', model: 'carrier', pool: 'carrier', type: 'hard', lane, x, k, M: S, y1: 3.9, hw: 1.3, hl: CA.hl,
        color: EZ.pick([0xc8102e, 0x1b4c8c, 0xf2f2ee, 0x2a2d33, 0x0e6b4e]), heavy: true, near: true, group: grp, role: 'host',
      });
      const at = (ds) => Planner.ride(S, ds, k);
      this.e.enqueue({ kind: 'ramp', type: 'ramp', pool: null, lane, x, k, M: at(-(CA.foot + CA.rampTop) / 2), hw: 1.1, hl: (CA.foot - CA.rampTop) / 2, y1: 0, group: grp, role: 'ramp' });
      // two cars on the lower deck, tucked under the upper deck and the ramp
      for (const [ds, model] of [[0.1, 'sedan'], [-4.9, 'hatch']]) {
        this.e.enqueue({ kind: 'rider', type: 'decor', pool: model, model, x, k, M: at(ds), y: 1.04, color: EZ.pick(TRAFFIC_COLORS), group: grp });
      }
      // charge cells up the ramp, along the deck and into the air off the front
      for (let u = 1; u <= 26; u += 2.6) {
        const y = EZ.Player.deckHeight(u) + Math.max(0, u - CA.foot + CA.kickTop) * 0.35;
        this.e.enqueue({ kind: 'volt', pool: 'volt', type: 'volt', lane, x, k, M: at(u - CA.foot), y: y + 0.9, hw: 0.45, hl: 0.45, y1: 0 });
      }
      // later on the other lanes are walled off too: hop the barriers or take the ramp
      if (d > 0.3) for (const l of EZ.LANES) if (l !== lane) this.stat('barrier', l, S + 34);
      return 200;
    }

    // A flatbed losing its load: crates and drums fall off the back as you close in.
    cargo(S0, d) {
      // the load lands 30 m short of the truck's meet point: start 60 m in so nothing planned
      // before this stretch is still in the clear lane
      const S = S0 + 60;
      const first = this.first('cargo');
      const lane = 1, k = EZ.LANE_K[1];
      const safe = EZ.pick([0, 2]), other = 2 - safe;
      this.vms(S - 175, first ? ['LOOSE LOAD', 'WATCH THE FLATBED'] : ['DEBRIS', 'ON ROADWAY']);
      this.clear(S0 - 20, S + 30);
      this.ch().quiet(S - 240, S + 20);
      const grp = { kind: 'cargo', items: [], next: 0, dropT: 0, safe, other };
      this.trafficM[lane].push(S);
      this.e.enqueue({
        kind: 'car', model: 'flatbed', pool: 'flatbed', type: 'hard', lane, x: 0, k, M: S, y1: 3.7, heavy: true, near: true,
        color: EZ.pick([0xc8102e, 0x1b4c8c, 0xf2f2ee, 0x2a2d33, 0xd07a1a]), group: grp, role: 'host', watch: true,
      });
      const n = 5 + (d > 0.4 ? 1 : 0);
      const kinds = EZ.shuffle(['drum', 'drum', 'crate', 'crate', 'crate', d > 0.4 ? 'drum' : 'crate']).slice(0, n);
      for (let i = 0; i < n; i++) {
        const drum = kinds[i] === 'drum';
        const ds = -7.3 + i * 1.4;
        this.e.enqueue({
          kind: 'cargo', cargo: kinds[i], pool: kinds[i], type: 'decor', x: (i % 2 ? 0.55 : -0.55), k, M: Planner.ride(S, ds, k),
          y: 1.35 + (drum ? 0.43 : 0.45), ground: drum ? 0.3 : 0.45, pitch: drum ? PI / 2 : 0, yaw: drum ? 0 : EZ.rand(-0.3, 0.3),
          y0: drum ? -0.3 : -0.45, y1: drum ? 0.3 : 0.45, hw: drum ? 0.34 : 0.5, hl: drum ? 0.45 : 0.5,
          color: drum ? EZ.pick([0x1d4f9c, 0xb02a1e, 0xe0b21c, 0x2f7a3a]) : null, group: grp, item: true,
        });
      }
      this.volts(safe, S - 52, S - 6);
      return 90;
    }

    // Toll plaza: green arrows are open, red crosses have the arm down (ride low or hop it),
    // and some lanes have a car stopped at the booth.
    toll(S, d) {
      const first = this.first('toll');
      this.vms(S - 175, first ? ['TOLL PLAZA', 'RED X: RIDE LOW'] : ['TOLL PLAZA', 'NO CASH LANES']);
      this.clear(S - 70, S + 20);
      this.ch().quiet(S - 220, S + 20);
      const states = d < 0.3
        ? EZ.shuffle(['open', 'arm', 'queue'])
        : EZ.shuffle(EZ.pick([['arm', 'arm', 'queue'], ['closing', 'arm', 'queue'], ['open', 'queue', 'queue'], ['closing', 'queue', 'arm']]));
      const grp = { kind: 'toll', hit: false };
      this.e.enqueue({ kind: 'toll', pool: 'toll', type: 'none', x: 0, k: 0, M: S, hw: 8, hl: 6.5, y1: 0, group: grp, role: 'host', onPass: 'toll' });
      // islands along the lane lines: the booths and their crash cushions
      for (const x of [-5.4, -1.8, 1.8, 5.4]) this.e.enqueue({ kind: 'booth', pool: null, type: 'hard', x, k: 0, M: S - 0.42, hw: 0.55, hl: 6.45, y1: 2.7, group: grp });
      states.forEach((st, l) => {
        const x = EZ.laneX(l);
        const sig = { kind: 'sig', pool: st === 'arm' || st === 'queue' ? 'tollStop' : 'tollGo', type: 'none', x, y: 4.35, k: 0, M: S - 4.95, hw: 0, hl: 0.1, y1: 0, group: grp, role: 'sig' + l };
        if (st !== 'queue') {
          const shut = st === 'arm';
          this.e.enqueue({
            kind: 'gate', pool: 'gate', type: shut ? 'low' : 'none', x, dx: -1.25, y: 1.22, roll: shut ? 0 : 1.42, k: 0, M: S - 1.6,
            hw: 1.3, hl: 0.12, y0: -0.07, y1: 0.1, closing: st === 'closing', sigRole: 'sig' + l, group: grp, watch: st === 'closing',
          });
          if (shut) this.volts(l, S - 9, S + 3, () => 0.5);
          else this.volts(l, S - 34, S + 6);
        } else {
          // queued at the booth, and at higher difficulty another car behind it
          this.parked(l, S - 4.3);
          if (d > 0.5) this.parked(l, S - 10.2);
        }
        this.e.enqueue(sig);
      });
      return 18;
    }
    parked(lane, M) {
      const model = EZ.weighted([['sedan', 3], ['hatch', 2], ['suv', 2]]), def = this.e.defs[model];
      this.e.enqueue({ kind: 'car', model, pool: model, type: 'hard', lane, x: EZ.laneX(lane), k: 0, M, y1: def.h, hw: def.hw, hl: def.hl, color: EZ.pick(TRAFFIC_COLORS), near: true });
    }

    // Crosswinds: gusts shove you a lane unless the suspension is down and the fans are pulling.
    wind(S, d) {
      const first = this.first('wind');
      const L = Math.round(300 + d * 100), dir = Math.random() < 0.5 ? -1 : 1;
      this.vms(S - 175, first ? ['CROSSWINDS', 'RIDE LOW IN GUSTS'] : ['GUSTY WINDS', 'NEXT 1/4 MILE']);
      for (const at of [S - 24, S + L * 0.55]) this.e.enqueue({ kind: 'sock', pool: 'windsock', type: 'decor', x: 7.5, k: 0, M: at, yaw: dir > 0 ? 0 : PI, y1: 5 });
      this.ch().schedule({ type: 'wind', s0: S, s1: S + L, dir, d });
      this.ch().quiet(S - 100, S + L);
      // light traffic: a gust can push you into it
      for (let at = S + 55; at < S + L - 30; at += EZ.rand(60, 85)) {
        const lanes = EZ.shuffle(EZ.LANES.slice()).filter((l) => this.canTraffic(l, at));
        if (lanes.length) this.car(lanes[0], at);
        if (Math.random() < 0.6) this.volts(EZ.pick(EZ.LANES), at - 24, at - 8);
      }
      return L;
    }

    // A rolling roadblock: three cruisers abreast, slower than you. The way through is over the top.
    rolling(S, d) {
      const first = this.first('rolling');
      const Sf = S + 190, k = 0.33;
      this.vms(S - 70, first ? ['ROLLING BLOCK', EZ.touch ? 'FLICK TO ROLL OVER' : 'Q / E TO ROLL OVER'] : ['ROLLING', 'ROADBLOCK']);
      this.clear(S - 10, Sf + 70);
      this.ch().quiet(S - 260, Sf + 40);
      const grp = { kind: 'rolling', n: 3, passed: 0, hit: false };
      const def = this.e.defs.cruiser;
      EZ.LANES.forEach((l, i) => {
        this.e.enqueue({ kind: 'cruiser', pool: 'cruiser', type: 'hard', lane: l, x: EZ.laneX(l), k, M: Sf + EZ.rand(-0.8, 0.8), y1: def.h, near: true, group: grp, weave: i * 2.1, watch: true, onPass: 'rolling' });
      });
      const lane = EZ.randi(0, 2);
      this.volts(lane, Sf - 12, Sf + 12, (s) => 1.1 + 1.8 * Math.sin(PI * EZ.clamp((s - Sf + 12) / 24, 0, 1)), k);
      this.e.enqueue({ kind: 'marker', pool: null, type: 'none', M: Sf - 260, k: 0, x: 0, hw: 0, hl: 0, y1: 0, onSpawn: () => this.e.g.say('rolling', {}, true) });
      return 190 + 70;
    }

    // Police drones drop EMP mines in your path. Hop them or change lanes.
    drones(S, d) {
      const first = this.first('drones');
      const L = Math.round(330 + d * 120);
      this.vms(S - 175, first ? ['DRONE PATROL', 'HOP THE EMP MINES'] : ['POLICE DRONES', 'IN THE AREA']);
      this.clear(S - 40, S + L + 20);
      this.ch().schedule({ type: 'drones', s0: S, s1: S + L, d });
      this.ch().quiet(S - 120, S + L + 40);
      this.volts(EZ.randi(0, 2), S - 40, S - 8);
      return L;
    }

    // Wireless charging lane: stay on it to top up, if the traffic lets you.
    strip(S) {
      const lane = EZ.randi(0, 2);
      this.ch().schedule({ type: 'strip', s0: S, s1: S + 260, lane });
      if (Math.abs(S - this.lastVMS) > 140) this.vms(S - 150, ['WIRELESS', 'CHARGING LANE']);
      this.nextStrip = S + EZ.rand(1800, 2600);
    }
  }

  EZ.Entities = Entities;
})();
