/* Zero Sixty: the Roadster's driving model.

   Ground: lane changes run on a critically damped spring and the body rides on its own springs
   (roll, pitch, heave). Air: ten cold-gas thrusters fed from compressed-air tanks hop the car,
   barrel-roll it across lanes, flip it upright and set it down softly. Suction fans under the
   car pull it onto the road hard enough to drive up a wall and along a ceiling. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE, C = EZ.C;
  const TAU = Math.PI * 2;
  const easeInOut = (e) => (e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2);
  const _v = new T.Vector3(), _d = new T.Vector3(), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _ax = new T.Vector3(), _e = new T.Euler();
  // corners of the body around its centre of mass, for ground contact while it tumbles
  const CORNERS = [];
  for (const x of [-0.95, 0.95]) for (const y of [-0.6, 0.62]) for (const z of [-2.2, 2.2]) CORNERS.push(new T.Vector3(x, y, z));

  class Player {
    static baseSpeed(s) { return 31 + 50 * (1 - Math.exp(-Math.max(0, s) / 10000)); }
    // Height of the car carrier's driving surface, u metres up from the foot of its ramp.
    static deckHeight(u) {
      const CA = EZ.Models.CARRIER;
      const ramp = CA.foot - CA.rampTop, flat = CA.rampTop - CA.deckEnd, kick = CA.deckEnd - CA.kickTop;
      if (u <= 0) return 0;
      if (u < ramp) return (u / ramp) * CA.deckY;
      if (u < ramp + flat) return CA.deckY;
      return CA.deckY + EZ.clamp((u - ramp - flat) / kick, 0, 1) * (CA.kickY - CA.deckY);
    }

    constructor(game) {
      this.g = game;
      this.model = EZ.Models.roadster(game.envMap);
      this.tubeShape = EZ.Models.tubeProfile();
      game.scene.add(this.model.root);
      const mat = new T.MeshBasicMaterial({
        map: EZ.Models.mats().blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      });
      this.shadow = new T.Mesh(new T.PlaneGeometry(2.6, 5.4).rotateX(-Math.PI / 2), mat);
      game.scene.add(this.shadow);
      this.setPaint(EZ.store.data.paint);
      this.reset();
    }
    setPaint(id) { this.model.setPaint(EZ.paintById(id)); }

    reset() {
      Object.assign(this, {
        s: 0, lane: 1, prevLane: 1, x: EZ.laneX(1), vx: 0, ax: 0,
        y: 0, vy: 0, air: false, airT: 0, peakY: 0, retro: false, slam: false,
        low: 0, lowHeld: false, lowHold: 0,
        speed: 0, accel: 0,
        hops: 3, hopCharge: 0, hopBuffer: 0,
        boost: 0, boosting: 0,
        battery: 100,
        stumble: 0, spiked: 0, wobble: 0,
        hover: 0, shield: 0, coil: 0, jammer: 0, ghost: 0,
        launch: 0, crashed: false,
        stunt: null, stuntRoll: 0, suction: 0,
        fire: { under: 0, left: 0, right: 0, rear: 0, front: 0 },
        roll: 0, rollV: 0, pitch: 0, pitchV: 0, heave: 0, heaveV: 0,
        wheelRot: 0, plate: 0, steer: 0, yaw: 0, spin: 0, spinV: 0, wingT: 0, fanRot: 0,
        wreck: null, spinOut: 0, scrape: 0, scrapeSide: 0,
        emp: 0, stuntPitch: 0, carrierJump: false,
      });
      this.reattachWheels();
      if (this.model) this.model.rig.rotation.set(0, 0, 0);
    }
    reattachWheels() {
      if (!this.loose) { this.loose = []; return; }
      for (const l of this.loose) {
        this.model.chassis.add(l.obj);
        l.obj.position.copy(l.home.position);
        l.obj.quaternion.copy(l.home.quaternion);
      }
      this.loose = [];
    }

    get top() { return this.y + this.heave + (this.low > 0 ? C.TOP_LOW + 0.13 : C.TOP); }
    get bottom() { return this.y + C.BOTTOM; }
    get lowered() { return this.low > 0 && !this.air && this.heave < -0.06; }
    get inTube() { return !!(this.stunt && this.stunt.type === 'tube'); }
    get rolling() { return !!(this.stunt && this.stunt.type === 'roll'); }
    get onDeck() { return !!(this.stunt && this.stunt.type === 'deck'); }

    // ---------------------------------------------------------------- controls
    left() { return this.steerTo(-1); }
    right() { return this.steerTo(1); }
    steerTo(dir) {
      if (this.crashed || this.rolling || this.onDeck) return false;
      if (this.inTube) {
        // upside down you pick which of the tube's two lanes to drop into
        const st = this.stunt;
        const l = this.lane + dir;
        if (l >= 0 && l < C.LANES && Math.abs(EZ.laneX(l) - st.cx) < 2) { st.landLane = l; this.lane = l; }
        return true;
      }
      const l = this.lane + dir;
      if (l >= 0 && l < C.LANES) { this.prevLane = this.lane; this.lane = l; return true; }
      this.vx += dir * 4;
      this.wobble = 0.3;
      return false;
    }
    hop() {
      if (this.crashed || this.hover > 0 || this.stunt) return 'no';
      if (this.emp > 0) return 'emp';
      if (this.air) { this.hopBuffer = 0.2; return 'buffered'; }
      if (this.hops < 1) return 'empty';
      this.hops -= 1;
      this.vy = C.HOP_V;
      this.air = true;
      this.airT = 0;
      this.peakY = 0;
      this.low = 0;
      this.heaveV += 1.4;
      this.fire.under = 0.22;
      return 'hop';
    }
    // Thrusters on one side fire and the car rolls over the next lane, landing two lanes across.
    barrelRoll(dir) {
      if (this.crashed || this.hover > 0 || this.stunt) return 'no';
      if (this.air && this.y > 0.7) return 'no';
      if (this.emp > 0) return 'emp';
      if (this.hops < 1) return 'empty';
      let target = this.lane + dir * 2;
      if (target < 0 || target >= C.LANES) target = this.lane + dir;
      if (target < 0 || target >= C.LANES) { this.vx += dir * 4; this.wobble = 0.3; return 'edge'; }
      this.hops -= 1;
      this.prevLane = this.lane;
      this.lane = target;
      this.stunt = { type: 'roll', t: 0, dur: (2 * C.ROLL_V) / C.GRAVITY, dir, x0: this.x, lanes: Math.abs(target - this.prevLane) };
      this.vy = C.ROLL_V;
      this.air = true;
      this.airT = 0;
      this.peakY = 0;
      this.low = 0;
      this.slam = false;
      this.fire.under = 0.25;
      this.fire[dir < 0 ? 'right' : 'left'] = 0.4;
      return 'roll';
    }
    duck(held) {
      if (this.crashed || this.hover > 0 || this.stunt) return 'no';
      if (this.air) { this.vy = Math.min(this.vy, -18); this.slam = true; return 'slam'; }
      const was = this.low > 0;
      this.low = 0.95;
      this.lowHeld = !!held;
      this.lowHold = 0;
      return was ? 'extend' : 'low';
    }
    releaseDuck() { this.lowHeld = false; }
    fireBoost() {
      if (this.boost >= 1 && this.boosting <= 0 && !this.crashed && this.emp <= 0) {
        this.boost = 0;
        this.boosting = 3.4;
        this.pitchV += 0.5;
        this.fire.rear = 0.9;
        return true;
      }
      return false;
    }
    bounceBack() {
      if (this.rolling) { this.stunt = null; }
      const l = this.lane;
      this.lane = this.prevLane;
      this.prevLane = l;
      this.vx *= -0.4;
    }
    // Onto a car carrier's ramp: the fans hold the car to the deck all the way to the headrack.
    startDeck(ramp) {
      const host = ramp.group && ramp.group.host;
      if (!host || host.dead || host.wrecked) return false;
      this.stunt = { type: 'deck', host, group: ramp.group, t: 0 };
      Object.assign(this, { air: false, vy: 0, low: 0, hover: 0, retro: false, slam: false, lane: ramp.lane, prevLane: ramp.lane });
      return true;
    }
    stepDeck(h) {
      const st = this.stunt, CA = EZ.Models.CARRIER, host = st.host;
      st.t += h;
      const u = this.s + C.P_HL * 0.4 - (host.s - CA.foot);
      const y = Player.deckHeight(u);
      const rampEnd = CA.foot - CA.rampTop, kickStart = CA.foot - CA.deckEnd, kickEnd = CA.foot - CA.kickTop;
      this.y = y;
      this.x = EZ.damp(this.x, host.x, 12, h);
      this.vx = 0;
      this.ax = 0;
      this.stuntPitch = EZ.damp(this.stuntPitch, u < rampEnd ? 0.33 : u < kickStart ? 0 : 0.5, 14, h);
      this.suction = 1;
      if (u >= kickEnd) {
        // off the headrack: the belly thrusters fire and the truck drops away behind
        this.stunt = null;
        Object.assign(this, { air: true, airT: 0, vy: 12.5, peakY: this.y, carrierJump: true });
        this.fire.under = 0.35;
        this.fire.rear = 0.3;
        this.g.onDeckLaunch();
      }
    }

    // The suction fans grab the tube wall as soon as you drive into it.
    startTube(e) {
      const side = this.x < e.x ? -1 : 1;
      let landLane = this.lane;
      if (Math.abs(EZ.laneX(landLane) - e.x) > 2) landLane = EZ.laneOf(e.x + side * C.LANE_W * 0.5);
      this.stunt = { type: 'tube', phase: 'climb', s0: e.s, cx: e.x, side, x0: this.x, y0: this.y, landLane, t: 0, sub: 'fall' };
      this.lane = landLane;
      this.prevLane = landLane;
      this.air = false;
      this.vy = 0;
      this.low = 0;
      this.hover = 0;
      this.retro = false;
    }

    // ---------------------------------------------------------------- physics
    tick(dt) {
      if (this.emp > 0) this.emp = Math.max(0, this.emp - dt);
      if (this.hops < 3 && this.emp <= 0) {
        this.hopCharge += dt / 2.3;
        if (this.hopCharge >= 1) { this.hopCharge = 0; this.hops++; }
      } else this.hopCharge = 0;
      this.hopBuffer = Math.max(0, this.hopBuffer - dt);
      if (this.boosting > 0) this.boosting = Math.max(0, this.boosting - dt);
      for (const k of ['stumble', 'spiked', 'wobble', 'coil', 'jammer', 'ghost', 'launch']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
      for (const k in this.fire) if (this.fire[k] > 0) this.fire[k] = Math.max(0, this.fire[k] - dt);
      if (this.hover > 0) {
        this.hover -= dt;
        this.fire.under = Math.max(this.fire.under, 0.05);
        if (this.hover <= 0) { this.hover = 0; this.vy = 0; this.airT = 1; this.peakY = this.y; this.ghost = 1.2; }
      }
    }
    step(h) {
      if (this.wreck) { this.stepWreck(h); return; }
      if (this.onDeck) {
        this.stepDeck(h);
        this.s += this.speed * h;
        return;
      }
      if (this.inTube) {
        this.stepTube(h);
        this.s += this.speed * h;
        return;
      }
      const st = this.stunt;
      if (st && st.type === 'roll') {
        st.t += h;
        const e = Math.min(1, st.t / st.dur);
        const nx = EZ.lerp(st.x0, EZ.laneX(this.lane), EZ.smoothstep(0, 1, e));
        this.vx = (nx - this.x) / h;
        this.x = nx;
        this.ax = 0;
        this.stuntRoll = -st.dir * TAU * easeInOut(e);
      } else {
        const tx = EZ.laneX(this.lane);
        const w = 15;
        const ax = w * w * (tx - this.x) - 2 * w * this.vx;
        this.vx += ax * h;
        this.x += this.vx * h;
        this.ax = ax;
      }
      if (this.hover > 0) {
        this.air = true;
        this.y = EZ.damp(this.y, 4.3, 3.2, h);
        this.vy = 0;
        this.peakY = this.y;
      } else if (this.air) {
        this.airT += h;
        this.vy -= C.GRAVITY * h;
        // falling from height: the belly thrusters catch the car and set it down like a lander
        if (!this.stunt && !this.slam && this.peakY > 2.4 && this.vy < -5 && this.y < this.peakY - 0.4) {
          this.vy = EZ.damp(this.vy, -3, 9, h);
          this.retro = true;
          this.fire.under = Math.max(this.fire.under, 0.08);
        }
        this.y += this.vy * h;
        this.peakY = Math.max(this.peakY, this.y);
        if (this.y <= 0) this.land();
      }
      if (this.low > 0 && !this.air) {
        if (this.lowHeld && this.lowHold < 1.6) { this.lowHold += h; this.low = Math.max(this.low, 0.25); }
        this.low -= h;
        if (this.low <= 0) { this.low = 0; this.lowHold = 0; }
      }
      this.s += this.speed * h;
    }
    stepTube(h) {
      const st = this.stunt, P = this.tubeShape;
      const LC = C.TUBE_CLIMB, LI = C.TUBE_CEIL;
      const u = this.s - st.s0;
      if (st.phase !== 'drop') {
        let phi, px, py;
        if (u < LC) {
          const a = P.a0 + (Math.PI - P.a0) * EZ.smoothstep(0, 1, Math.max(0, u) / LC);
          [px, py] = P.point(st.side, a);
          const [qx, qy] = P.point(st.side, Math.min(Math.PI, a + 0.01));
          phi = Math.atan2(st.side * (qy - py), st.side * (qx - px));
          if (st.side < 0 && phi > 0.5) phi -= TAU;
          if (a > Math.PI - 0.012) phi = st.side * Math.PI;
        } else {
          st.phase = 'ceiling';
          px = 0; py = 2 * P.R; phi = st.side * Math.PI;
        }
        const m = EZ.smoothstep(0, 5, u);
        phi *= m;
        const rx = st.cx + px - 0.6 * Math.sin(phi);
        const ry = py + 0.6 * Math.cos(phi) - 0.6;
        const nx = EZ.lerp(st.x0, rx, m);
        this.vx = (nx - this.x) / h;
        this.x = nx;
        this.y = EZ.lerp(st.y0, ry, m);
        this.stuntRoll = phi;
        this.air = true;
        this.ax = 0;
        this.suction = 1;
        if (u >= LC + LI) {
          st.phase = 'drop';
          st.t = 0;
          this.vy = 0;
          this.fire[st.side < 0 ? 'right' : 'left'] = 0.9;
        }
        return;
      }
      // off the end of the deck: thrusters roll it upright as it falls, hover, then touch down
      st.t += h;
      this.stuntRoll = st.side * Math.PI * (1 + EZ.smoothstep(0, 1, st.t / 0.8));
      this.x = EZ.damp(this.x, EZ.laneX(st.landLane), 5, h);
      this.fire.under = Math.max(this.fire.under, 0.06);
      if (st.sub === 'fall') {
        this.vy -= C.GRAVITY * h;
        this.y += this.vy * h;
        if (this.y < 2.0) { st.sub = 'hover'; st.hoverT = 0; this.vy = 0; }
      } else if (st.sub === 'hover') {
        st.hoverT += h;
        this.y = EZ.damp(this.y, 0.9, 6, h);
        if (st.hoverT > 0.45) st.sub = 'touch';
      } else {
        this.y -= 2.6 * h;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          this.air = false;
          this.stunt = null;
          this.stuntRoll = 0;
          this.lane = st.landLane;
          this.prevLane = this.lane;
          this.vx = 0;
          this.ghost = 0.6;
          this.heaveV -= 0.3;
          this.g.onTubeLand();
        }
      }
    }
    land() {
      const impact = -this.vy;
      const soft = this.retro;
      this.y = 0;
      this.vy = 0;
      this.air = false;
      this.heaveV -= impact * 0.09;
      this.pitchV -= impact * 0.025;
      this.retro = false;
      this.slam = false;
      this.peakY = 0;
      const rolled = this.rolling ? this.stunt : null;
      if (rolled) { this.stunt = null; this.stuntRoll = 0; }
      this.g.onLand(impact, soft, rolled);
      if (this.hopBuffer > 0) { this.hopBuffer = 0; this.g.action('hop'); }
    }
    // Head-on impact: the car keeps some of its momentum and tumbles as a rigid body.
    // side: which way it gets kicked. low: it hit something at windscreen height.
    crash(info = {}) {
      const v = Math.max(this.speed, 10);
      const sev = EZ.clamp((v - 12) / 45, 0, 1);
      const side = info.side || (Math.random() < 0.5 ? -1 : 1);
      this.crashed = true;
      this.stunt = null;
      this.low = 0;
      this.hover = 0;
      _e.set(this.pitch, this.yaw, this.roll + this.stuntRoll, 'YXZ');
      const q = new T.Quaternion().setFromEuler(_e);
      const pos = new T.Vector3(this.x, this.y + 0.6, -this.s);
      const vel = info.low
        ? new T.Vector3(side * EZ.rand(0.5, 2), 2.2 + sev * 2, -v * 0.06)
        : new T.Vector3(side * EZ.rand(1.5, 4) * (0.4 + sev), 3 + sev * 7.5, -v * (0.16 + sev * 0.22));
      const roll = side * (1.2 + sev * 6.5) * (Math.random() < 0.55 ? 1 : 0.35);
      const w = info.low
        ? new T.Vector3(2.2 + sev * 2.5, EZ.rand(-1.2, 1.2), roll * 0.4)
        : new T.Vector3(-(1.2 + sev * 4.5) * (Math.random() < 0.6 ? 1 : 0.3), EZ.rand(-1.5, 1.5) + side * sev * 1.5, roll);
      this.wreck = { pos, vel, q, w, t: 0, settled: false, contact: false };
      this.speed = 0;
      this.accel = 0;
      // a hard hit tears a front wheel off
      if (sev > 0.35) this.detachWheel(side < 0 ? 0 : 1, vel, side);
      return sev;
    }
    detachWheel(i, vel, side) {
      const wh = this.model.wheels[i];
      if (!wh || this.loose.some((l) => l.obj === wh.pivot)) return;
      const home = { position: wh.pivot.position.clone(), quaternion: wh.pivot.quaternion.clone() };
      this.model.root.updateMatrixWorld(true);
      this.g.scene.attach(wh.pivot);
      this.loose.push({
        obj: wh.pivot, home, r: wh.r,
        vel: new T.Vector3(vel.x + side * EZ.rand(3, 6), vel.y + EZ.rand(2, 5), vel.z * 1.1),
        w: new T.Vector3(EZ.rand(-14, -8), EZ.rand(-3, 3), EZ.rand(-4, 4)),
      });
    }
    // Getting caught: the lead cruiser taps your rear quarter and the car spins out.
    pitSpin(side) {
      this.spinOut = 1.6;
      this.spinV = side * EZ.rand(2.4, 3.2);
      this.low = 0;
    }
    stepWreck(h) {
      const W = this.wreck;
      W.t += h;
      W.vel.y -= 26 * h;
      W.pos.addScaledVector(W.vel, h);
      const ang = W.w.length();
      if (ang > 1e-4) {
        _q2.setFromAxisAngle(_ax.copy(W.w).divideScalar(ang), ang * h);
        W.q.premultiply(_q2).normalize();
      }
      let lowest = Infinity;
      const pt = _v;
      for (const c of CORNERS) {
        _d.copy(c).applyQuaternion(W.q).add(W.pos);
        if (_d.y < lowest) { lowest = _d.y; pt.copy(_d); }
      }
      W.contact = lowest < 0;
      if (W.contact) {
        W.pos.y -= lowest;
        if (W.vel.y < 0) {
          const impact = -W.vel.y;
          W.vel.y = impact > 2.2 ? impact * 0.3 : 0;
          if (impact > 2.2) {
            // a bounce steals spin and scatters sparks
            W.w.multiplyScalar(0.72);
            W.w.x += EZ.rand(-0.8, 0.8);
            this.g.onWreckBounce(pt.x, pt.z, impact, W.vel);
          }
        }
        const f = Math.exp(-3.4 * h);
        W.vel.x *= f;
        W.vel.z *= f;
        W.w.multiplyScalar(Math.exp(-2.4 * h));
        if (Math.hypot(W.vel.x, W.vel.z) > 3 && Math.random() < 0.5) this.g.fx.sparks(pt.x, 0.05, pt.z, W.vel.x * 0.3, W.vel.z * 0.3, 2);
      }
      // once it has slowed, it rolls onto whichever face is nearest: wheels, roof or a side
      if (W.contact && Math.hypot(W.vel.x, W.vel.z) < 5 && W.w.length() < 3.5) {
        const up = _d.set(0, 1, 0).applyQuaternion(W.q);
        const fwd = _ax.set(0, 0, -1).applyQuaternion(W.q);
        const yaw = Math.atan2(-fwd.x, -fwd.z);
        const rest = up.y > 0.4 ? 0 : up.y < -0.4 ? Math.PI : up.x > 0 ? -Math.PI / 2 : Math.PI / 2;
        _q2.setFromEuler(_e.set(0, yaw, rest, 'YXZ'));
        W.q.slerp(_q2, 1 - Math.exp(-5 * h));
        W.w.multiplyScalar(Math.exp(-6 * h));
        if (W.q.angleTo(_q2) < 0.03 && W.vel.length() < 0.6) W.settled = true;
      }
      this.x = W.pos.x;
      this.y = W.pos.y - 0.6;
      this.s = -W.pos.z;
      for (const l of this.loose) {
        l.vel.y -= 26 * h;
        l.obj.position.addScaledVector(l.vel, h);
        if (l.obj.position.y < l.r) {
          l.obj.position.y = l.r;
          if (l.vel.y < -1.5) { l.vel.y *= -0.45; this.g.fx.sparks(l.obj.position.x, 0.05, l.obj.position.z, 0, 0, 3); } else l.vel.y = 0;
          l.vel.x *= Math.exp(-1.2 * h);
          l.vel.z *= Math.exp(-0.8 * h);
          // on the ground it rolls: spin follows how fast it's travelling
          l.w.x = EZ.damp(l.w.x, -Math.hypot(l.vel.x, l.vel.z) / l.r, 4, h);
          l.w.y *= Math.exp(-2 * h);
          l.w.z *= Math.exp(-2 * h);
        }
        const a = l.w.length();
        if (a > 1e-4) l.obj.quaternion.premultiply(_q2.setFromAxisAngle(_ax.copy(l.w).divideScalar(a), a * h));
      }
    }

    // ---------------------------------------------------------------- visuals
    animate(dt, t, night) {
      const m = this.model;
      const spring = (val, vel, target, k, c) => {
        const a = k * (target - val) - c * vel;
        vel += a * dt;
        return [val + vel * dt, vel];
      };
      const latA = EZ.clamp(this.ax, -260, 260);
      const shake = this.wobble > 0 ? Math.sin(t * 42) * 0.035 * (this.wobble / 0.3) : 0;
      const spikeWobble = this.spiked > 0 ? Math.sin(t * 25) * 0.04 : 0;
      [this.roll, this.rollV] = spring(this.roll, this.rollV, EZ.clamp(latA * 0.00032, -0.075, 0.075) + shake + spikeWobble, 140, 12);
      const pitchT = EZ.clamp(this.accel * 0.004, -0.06, 0.055) + (this.air && !this.stunt ? EZ.clamp(this.vy * 0.008, -0.08, 0.08) : 0);
      [this.pitch, this.pitchV] = spring(this.pitch, this.pitchV, pitchT, 110, 11);
      const heaveT = this.low > 0 && !this.air ? -0.13 : this.air && !this.inTube ? 0.03 : 0;
      [this.heave, this.heaveV] = spring(this.heave, this.heaveV, heaveT, 170, 13);

      // settle any leftover rotation from an interrupted roll
      if (!this.stunt && this.stuntRoll !== 0) {
        let r = this.stuntRoll % TAU;
        if (r > Math.PI) r -= TAU;
        if (r < -Math.PI) r += TAU;
        this.stuntRoll = Math.abs(r) < 0.002 ? 0 : EZ.damp(r, 0, 10, dt);
      }

      this.spin += this.spinV * dt;
      this.spinV *= Math.exp(-2 * dt);
      this.yaw = this.inTube ? 0 : -Math.atan2(this.vx, Math.max(this.speed, 10)) * (this.rolling ? 0.25 : 0.62) + this.spin + spikeWobble * 1.5;
      if (this.wreck) {
        m.root.position.set(this.x, this.y, -this.s);
        m.root.rotation.set(0, 0, 0);
        m.rig.quaternion.copy(this.wreck.q);
        m.body.position.y = 0;
        m.body.rotation.set(0, 0, 0);
      } else {
        if (!this.onDeck && this.stuntPitch !== 0) this.stuntPitch = Math.abs(this.stuntPitch) < 0.002 ? 0 : EZ.damp(this.stuntPitch, 0, this.air ? 2.5 : 10, dt);
        m.root.position.set(this.x, this.y, -this.s);
        m.root.rotation.set(0, this.yaw, 0);
        m.rig.rotation.set(this.stuntPitch, 0, this.stuntRoll);
        m.body.position.y = this.heave;
        m.body.rotation.set(this.pitch, 0, this.roll);
      }

      this.wheelRot += (this.speed * dt) / 0.34 + (this.launch > 1.3 ? dt * 38 : 0);
      this.steer = EZ.damp(this.steer, EZ.clamp(-latA * 0.0011, -0.32, 0.32), 18, dt);
      const droop = this.air && !this.inTube ? -0.07 : 0;
      for (const w of m.wheels) {
        w.spin.rotation.x = -this.wheelRot;
        if (w.front) w.pivot.rotation.y = this.steer;
        w.pivot.position.y = EZ.damp(w.pivot.position.y, w.baseY + droop, 20, dt);
      }

      // suction fans: spin up when the car needs grip, glow when they're pulling hard
      const suctionT = Math.max(this.inTube ? 1 : 0, this.lowered ? 0.8 : 0, Math.abs(latA) / 200, this.stumble > 0 ? 0.6 : 0);
      this.suction = EZ.damp(this.suction, EZ.clamp(suctionT, 0, 1), 6, dt);
      this.fanRot += dt * (6 + this.suction * 70);
      for (const f of m.fans) f.rotation.z = this.fanRot;
      m.mats.fanGlowMat.color.setRGB(EZ.lerp(0.1, 0.62, this.suction), EZ.lerp(0.15, 0.82, this.suction), EZ.lerp(0.2, 1.0, this.suction));

      // active rear wing: up for grip, flat for top speed
      const wingUp = (this.suction > 0.3 || this.speed < 20 || this.inTube) && this.boosting <= 0 ? 1 : 0;
      this.wingT = EZ.damp(this.wingT, wingUp, 5, dt);
      const hgt = 0.04 + 0.26 * this.wingT;
      m.wing.position.y = m.deckY + hgt;
      m.blade.rotation.x = -0.22 * this.wingT;
      for (const st of m.struts) { st.scale.y = hgt; st.position.y = -hgt / 2; }

      // licence plate flips up to uncover the rear nozzles
      const anyFire = this.fire.under + this.fire.left + this.fire.right + this.fire.rear + this.fire.front > 0;
      this.plate = EZ.damp(this.plate, this.air || this.hover > 0 || this.fire.rear > 0 ? -1.35 : 0, 14, dt);
      m.plateHinge.rotation.x = this.plate;
      m.mats.nozzleMat.color.setHex(anyFire ? 0xbfe2ff : 0x2a2d31);

      const braking = this.stumble > 0 || this.accel < -8 || this.crashed;
      m.mats.tailMat.color.setHex(braking ? 0xff3a4e : 0xc81022);
      m.glowMats.tail.opacity = EZ.clamp(night * 0.6 + (braking ? 0.5 : 0), 0, 1);
      m.glowMats.head.opacity = night * 0.9;
      m.beamMat.opacity = this.y < 1 ? night * 0.3 : 0;
      const dx = EZ.laneX(this.lane) - this.x;
      const on = !this.stunt && Math.abs(dx) > 0.35 && (t * 3.2) % 1 < 0.55;
      // after a crash or a spin-out, both sides blink: hazard lights
      const hazard = this.crashed && (t * 1.7) % 1 < 0.5;
      for (const b of m.blinkers.L) b.visible = hazard || (!this.crashed && on && dx < 0);
      for (const b of m.blinkers.R) b.visible = hazard || (!this.crashed && on && dx > 0);

      if (this.spinOut > 0) this.spinOut = Math.max(0, this.spinOut - dt);
      if (this.scrape > 0) this.scrape = Math.max(0, this.scrape - dt);
      const hy = Math.min(this.y, 8);
      this.shadow.position.set(this.x, 0.035, -this.s);
      this.shadow.rotation.y = this.wreck ? Math.atan2(-_ax.set(0, 0, -1).applyQuaternion(this.wreck.q).x, -_ax.z) : this.yaw;
      const sc = Math.max(0.35, 1 - hy * 0.09);
      this.shadow.scale.set(sc, 1, sc);
      this.shadow.material.opacity = EZ.clamp(1 - hy * 0.16, 0.12, 1);

      if (dt > 0) this.emit(dt);
    }

    emit(dt) {
      const m = this.model, fx = this.g.fx, z = -this.s;
      if (this.launch > 0.8 && this.speed > 0.5) {
        for (const sx of [-0.86, 0.86]) fx.tyreSmoke(this.x + sx, 0, z + 1.5, -this.speed * 0.08, 1);
      }
      if (this.lowered && this.speed > 10 && Math.random() < 0.35) {
        fx.sparks(this.x + EZ.rand(-0.6, 0.6), 0.04, z + EZ.rand(-1.2, 1.4), 0, -this.speed * 0.1, 2);
      }
      if (this.spiked > 0 && Math.random() < 0.4) fx.tyreSmoke(this.x + EZ.rand(-0.9, 0.9), 0, z + 1.3, -this.speed * 0.1, 1);
      // spin-out: all four tyres smoke while the car slides sideways
      if (this.spinOut > 0 && this.speed > 2) {
        for (const w of this.model.wheels) {
          if (Math.random() < 0.6) { w.pivot.getWorldPosition(_v); fx.tyreSmoke(_v.x, 0, _v.z, -this.speed * 0.2, 1); }
        }
      }
      // a side scrape drags a trail of sparks along the door
      if (this.scrape > 0 && !this.wreck) {
        for (let i = 0; i < 2; i++) fx.sparks(this.x + this.scrapeSide * 0.95, 0.45, z + EZ.rand(-1.6, 1.2), this.scrapeSide * 2, -this.speed * 0.15, 1);
      }
      // cold gas from whichever nozzles are firing, in world space
      const f = this.fire;
      if (f.under + f.left + f.right + f.rear + f.front <= 0) return;
      m.root.updateMatrixWorld(true);
      m.chassis.getWorldQuaternion(_q);
      for (const n of m.thrusters) {
        const d = n.dir;
        const lvl = d.y < -0.5 ? f.under : d.z > 0.5 ? f.rear : d.z < -0.5 ? f.front : d.x < 0 ? f.left : f.right;
        if (lvl <= 0 || Math.random() > (n.rear ? 0.9 : 0.6)) continue;
        _v.copy(n.pos);
        m.chassis.localToWorld(_v);
        _d.copy(d).applyQuaternion(_q);
        const push = n.rear ? 16 : 9;
        fx.vapor(_v.x, _v.y, _v.z, _d.x * push + this.vx * 0.5, _d.y * push, _d.z * push - this.speed * 0.55, 1);
      }
    }
  }

  EZ.Player = Player;
})();
