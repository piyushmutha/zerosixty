/* Zero Sixty: tyre smoke, cold-gas vapour, sparks and boost streaks. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE, G = EZ.Geo;

  const VERT = `
    attribute float psize;
    attribute float palpha;
    attribute vec3 pcolor;
    uniform float uScale;
    varying float vA;
    varying vec3 vC;
    void main() {
      vA = palpha;
      vC = pcolor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = psize * uScale / max(0.2, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    uniform sampler2D uTex;
    varying float vA;
    varying vec3 vC;
    void main() {
      vec4 t = texture2D(uTex, gl_PointCoord);
      float a = t.a * vA;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vC * t.rgb, a);
    }`;

  class Particles {
    constructor(scene, cap, tex, additive) {
      this.cap = cap;
      this.pos = new Float32Array(cap * 3);
      this.col = new Float32Array(cap * 3);
      this.size = new Float32Array(cap);
      this.alpha = new Float32Array(cap);
      this.vel = new Float32Array(cap * 3);
      this.life = new Float32Array(cap);
      this.max = new Float32Array(cap);
      this.grow = new Float32Array(cap);
      this.a0 = new Float32Array(cap);
      this.drag = new Float32Array(cap);
      this.grav = new Float32Array(cap);
      this.next = 0;
      const g = (this.geo = new T.BufferGeometry());
      this.attrPos = new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage);
      this.attrCol = new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage);
      this.attrSize = new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage);
      this.attrAlpha = new T.BufferAttribute(this.alpha, 1).setUsage(T.DynamicDrawUsage);
      g.setAttribute('position', this.attrPos);
      g.setAttribute('pcolor', this.attrCol);
      g.setAttribute('psize', this.attrSize);
      g.setAttribute('palpha', this.attrAlpha);
      this.mat = new T.ShaderMaterial({
        uniforms: { uTex: { value: tex }, uScale: { value: 400 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? T.AdditiveBlending : T.NormalBlending,
      });
      this.points = new T.Points(g, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
      scene.add(this.points);
      this.live = 0;
    }
    emit(x, y, z, vx, vy, vz, life, size, grow, color, alpha, drag = 1, grav = 0) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.life[i] = life; this.max[i] = life;
      this.size[i] = size; this.grow[i] = grow;
      this.a0[i] = alpha; this.alpha[i] = alpha;
      this.drag[i] = drag; this.grav[i] = grav;
      const c = color;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.live = 1;
    }
    update(dt) {
      if (!this.live) return;
      let any = 0;
      for (let i = 0; i < this.cap; i++) {
        if (this.life[i] <= 0) continue;
        any = 1;
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        const k = Math.exp(-this.drag[i] * dt);
        this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.size[i] += this.grow[i] * dt;
        const t = this.life[i] / this.max[i];
        this.alpha[i] = this.a0[i] * Math.min(1, t * 1.6);
      }
      this.live = any;
      this.attrPos.needsUpdate = this.attrSize.needsUpdate = this.attrAlpha.needsUpdate = this.attrCol.needsUpdate = true;
    }
    clear() {
      this.life.fill(0); this.alpha.fill(0);
      this.attrAlpha.needsUpdate = true;
    }
  }

  // Chips of bodywork, carbon and glass that fly, tumble, bounce and fade out.
  class Debris {
    constructor(scene, cap) {
      this.cap = cap;
      this.mesh = new T.InstancedMesh(new T.BoxGeometry(0.22, 0.035, 0.15), new T.MeshLambertMaterial({ color: 0xffffff }), cap);
      this.mesh.frustumCulled = false;
      this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.zero = new T.Matrix4().makeScale(0, 0, 0);
      this.m = new T.Matrix4();
      this.c = new T.Color();
      this.e = new T.Euler();
      this.dq = new T.Quaternion();
      this.ax = new T.Vector3();
      this.sc = new T.Vector3();
      this.items = [];
      for (let i = 0; i < cap; i++) {
        this.mesh.setMatrixAt(i, this.zero);
        this.mesh.setColorAt(i, this.c.set(0xffffff));
        this.items.push({ life: 0, p: new T.Vector3(), v: new T.Vector3(), q: new T.Quaternion(), w: new T.Vector3(), s: 1 });
      }
      scene.add(this.mesh);
      this.next = 0;
      this.live = 0;
    }
    emit(x, y, z, vx, vy, vz, n, colors, scale = 1) {
      for (let k = 0; k < n; k++) {
        const i = this.next, it = this.items[i];
        this.next = (this.next + 1) % this.cap;
        it.life = EZ.rand(2.4, 4);
        it.p.set(x + EZ.rand(-0.5, 0.5), y + EZ.rand(0, 0.4), z + EZ.rand(-0.6, 0.6));
        it.v.set(vx + EZ.rand(-5, 5), vy + EZ.rand(2, 7), vz + EZ.rand(-4, 4));
        it.q.setFromEuler(this.e.set(EZ.rand(0, 6), EZ.rand(0, 6), EZ.rand(0, 6)));
        it.w.set(EZ.rand(-16, 16), EZ.rand(-16, 16), EZ.rand(-16, 16));
        it.s = scale * EZ.rand(0.45, 1.4);
        this.mesh.setColorAt(i, this.c.set(EZ.pick(colors)));
      }
      this.mesh.instanceColor.needsUpdate = true;
      this.live = 1;
    }
    update(dt) {
      if (!this.live || dt <= 0) return;
      let any = 0;
      for (let i = 0; i < this.cap; i++) {
        const it = this.items[i];
        if (it.life <= 0) continue;
        it.life -= dt;
        if (it.life <= 0) { this.mesh.setMatrixAt(i, this.zero); continue; }
        any = 1;
        it.v.y -= 22 * dt;
        it.p.addScaledVector(it.v, dt);
        if (it.p.y < 0.03) {
          it.p.y = 0.03;
          it.v.y = Math.abs(it.v.y) > 1.5 ? -it.v.y * 0.3 : 0;
          it.v.x *= 0.72;
          it.v.z *= 0.72;
          it.w.multiplyScalar(0.55);
        }
        const a = it.w.length();
        if (a > 1e-3) it.q.premultiply(this.dq.setFromAxisAngle(this.ax.copy(it.w).divideScalar(a), a * dt));
        const f = it.s * Math.min(1, it.life / 0.5);
        this.m.compose(it.p, it.q, this.sc.set(f, f, f));
        this.mesh.setMatrixAt(i, this.m);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      this.live = any;
    }
    clear() {
      for (let i = 0; i < this.cap; i++) { this.items[i].life = 0; this.mesh.setMatrixAt(i, this.zero); }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  class FX {
    constructor(game) {
      this.g = game;
      const scene = game.scene;
      const smoke = G.smokeTexture(), glow = EZ.Models.mats().glow;
      this.smoke = new Particles(scene, 420, smoke, false);
      this.spark = new Particles(scene, 260, glow, true);
      this.c = {
        smoke: new T.Color(0xd9d9d6),
        dust: new T.Color(0xc9b08a),
        vapor: new T.Color(0xf4f8ff),
        spark: new T.Color(0xffb347),
        volt: new T.Color(0xffd34d),
        blue: new T.Color(0x9fc2ff),
        dark: new T.Color(0x6a6a68),
        glass: new T.Color(0xffd98a),
      };
      this.debris = new Debris(scene, 90);
      // boost streaks: thin lines that rush past the camera
      const n = 36;
      const pos = new Float32Array(n * 6);
      this.streakGeo = new T.BufferGeometry();
      this.streakGeo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
      this.streakMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
      this.streaks = new T.LineSegments(this.streakGeo, this.streakMat);
      this.streaks.frustumCulled = false;
      scene.add(this.streaks);
      this.streakData = [];
      for (let i = 0; i < n; i++) this.streakData.push(this.newStreak(EZ.rand(-70, -10)));
      this.streakLevel = 0;
    }
    // streaks live in the edges of the view so they never cross the car
    newStreak(z) {
      const side = Math.random() < 0.5 ? -1 : 1;
      return { x: side * EZ.rand(4.5, 11), y: EZ.rand(-1.5, 5), z, len: EZ.rand(1.5, 4) };
    }
    setScale(h, fov) {
      const s = h / 2 / Math.tan((fov * Math.PI) / 360);
      this.smoke.mat.uniforms.uScale.value = s;
      this.spark.mat.uniforms.uScale.value = s;
    }
    reset() { this.smoke.clear(); this.spark.clear(); this.debris.clear(); this.streakLevel = 0; }
    chips(x, y, z, vx, vy, vz, n, colors, scale) { this.debris.emit(x, y, z, vx, vy, vz, Math.round(n), colors, scale); }
    // shattering glass: a quick spray of bright flecks
    glass(x, y, z, vz, n = 30) {
      for (let i = 0; i < n; i++) {
        this.spark.emit(x + EZ.rand(-0.6, 0.6), y + EZ.rand(0, 0.5), z, EZ.rand(-6, 6), EZ.rand(1, 7), vz + EZ.rand(-5, 5), EZ.rand(0.4, 0.9), EZ.rand(0.05, 0.1), -0.05, this.c.glass, 1, 1.2, 16);
      }
    }

    tyreSmoke(x, y, z, vz, amount = 1) {
      for (let i = 0; i < amount; i++) {
        this.smoke.emit(x + EZ.rand(-0.15, 0.15), y + 0.15, z + EZ.rand(-0.2, 0.2), EZ.rand(-1.2, 1.2), EZ.rand(0.4, 1.4), vz + EZ.rand(-1, 1), EZ.rand(0.9, 1.6), EZ.rand(0.6, 1.0), 2.4, this.c.smoke, 0.5, 1.4, -0.4);
      }
    }
    vapor(x, y, z, vx, vy, vz, n = 10) {
      for (let i = 0; i < n; i++) {
        this.smoke.emit(x + EZ.rand(-0.3, 0.3), y, z + EZ.rand(-0.3, 0.3), vx + EZ.rand(-2, 2), vy + EZ.rand(-1, 1), vz + EZ.rand(-2, 2), EZ.rand(0.35, 0.7), EZ.rand(0.5, 0.9), 3.5, this.c.vapor, 0.75, 3.2, 0);
      }
    }
    dust(x, z, vz, n = 8) {
      for (let i = 0; i < n; i++) {
        this.smoke.emit(x + EZ.rand(-1, 1), 0.2, z + EZ.rand(-1.5, 1.5), EZ.rand(-3, 3), EZ.rand(0.5, 2), vz + EZ.rand(-2, 2), EZ.rand(0.5, 1.0), EZ.rand(0.8, 1.2), 2.5, this.c.dust, 0.4, 2, 0);
      }
    }
    // a streak of wind-blown dust (or snow, or grit) crossing the road
    gust(x, y, z, vx, vz, color) {
      this.smoke.emit(x, y, z, vx, EZ.rand(-0.3, 0.6), vz, EZ.rand(0.8, 1.2), EZ.rand(1.1, 1.8), 2.4, color, 0.38, 0.3, 0);
    }
    sparks(x, y, z, vx, vz, n = 14, color) {
      for (let i = 0; i < n; i++) {
        this.spark.emit(x, y, z, vx + EZ.rand(-5, 5), EZ.rand(1, 6), vz + EZ.rand(-4, 4), EZ.rand(0.2, 0.5), EZ.rand(0.08, 0.16), -0.1, color || this.c.spark, 1, 1.5, 14);
      }
    }
    voltBurst(x, y, z, vz) {
      for (let i = 0; i < 8; i++) {
        this.spark.emit(x, y, z, EZ.rand(-3, 3), EZ.rand(-1, 3), vz + EZ.rand(-3, 3), EZ.rand(0.2, 0.35), EZ.rand(0.25, 0.4), -0.6, this.c.volt, 0.9, 3, 0);
      }
    }
    smokeColumn(x, y, z, n = 3) {
      for (let i = 0; i < n; i++) {
        this.smoke.emit(x + EZ.rand(-0.5, 0.5), y, z + EZ.rand(-0.5, 0.5), EZ.rand(-0.5, 0.5), EZ.rand(1.5, 3), EZ.rand(-0.5, 0.5), EZ.rand(1.5, 2.5), EZ.rand(1, 1.6), 1.8, this.c.dark, 0.45, 0.6, -0.3);
      }
    }
    update(dt, cam, speed, boost) {
      this.smoke.update(dt);
      this.spark.update(dt);
      this.debris.update(dt);
      this.streakLevel = EZ.damp(this.streakLevel, boost ? 1 : 0, 5, dt);
      this.streakMat.opacity = this.streakLevel * 0.35;
      this.streaks.visible = this.streakLevel > 0.02;
      if (!this.streaks.visible) return;
      const a = this.streakGeo.attributes.position.array;
      const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      this.streakData.forEach((s, i) => {
        s.z += speed * 1.6 * dt;
        if (s.z > -6) Object.assign(s, this.newStreak(EZ.rand(-75, -45)));
        const x = cx + s.x, y = cy + s.y - 2, z = cz + s.z;
        a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z;
        a[i * 6 + 3] = x; a[i * 6 + 4] = y; a[i * 6 + 5] = z - s.len;
      });
      this.streakGeo.attributes.position.needsUpdate = true;
    }
  }
  EZ.FX = FX;
})();
