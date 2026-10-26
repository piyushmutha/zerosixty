/* Zero Sixty: sky, road, terrain, scenery, overhead signs and the light of each region. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE, G = EZ.Geo, C = EZ.C;
  const PI = Math.PI;

  // ---------------------------------------------------------------- sky dome
  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = p.xyww;
    }`;
  const SKY_FRAG = `
    uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSun;
    uniform vec3 uSunDir; uniform float uSunSize; uniform float uGlow;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.6, h), 0.75)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.12, -h));
      col = mix(col, uHorizon * 1.04, exp(-abs(h) * 22.0) * 0.35);
      float ang = acos(clamp(dot(d, normalize(uSunDir)), -1.0, 1.0));
      float disc = 1.0 - smoothstep(uSunSize * 0.82, uSunSize, ang);
      float glow = exp(-ang * ang / 0.06) * uGlow + exp(-ang * ang / 0.6) * uGlow * 0.25;
      col += uSun * (disc * 0.9 + glow * 0.45);
      gl_FragColor = vec4(col, 1.0);
    }`;

  // ---------------------------------------------------------------- terrain heights
  const bump = (x, zl) => Math.sin(x * 0.071 + 1.3) * Math.cos((zl / 100) * PI * 4) * 0.5 + Math.sin(x * 0.023 + zl * 0.0628) * 0.5;
  const HEIGHT = {
    pacific(x, zl) {
      if (x <= -10.7) { const t = -10.7 - x; return 58 * (1 - Math.exp(-t / 70)) + bump(x, zl) * Math.min(1, t / 40) * 6; }
      if (x >= 11.2) return -14;
      return 0;
    },
    mojave(x, zl) {
      const ax = Math.abs(x);
      return ax > 45 ? bump(x, zl) * 1.6 * Math.min(1, (ax - 45) / 60) : 0;
    },
    downtown() { return 0; },
    sierra(x, zl) {
      if (x >= 11.2) { const t = x - 11.2; return 78 * (1 - Math.exp(-t / 90)) + bump(x, zl) * Math.min(1, t / 30) * 5; }
      if (x <= -9.7) { const t = -9.7 - x; return 66 * (1 - Math.exp(-t / 80)) + bump(x, zl) * Math.min(1, t / 30) * 5; }
      return 0;
    },
  };
  // terrain grids per region: [x0, x1, cells across, cells along]
  const TERRAIN = {
    pacific: [[8.4, 11.2, 1, 1], [11.2, 1900, 1, 1], [-6.9, -420, 16, 5]],
    mojave: [[8.4, 1500, 12, 4], [-6.9, -1500, 12, 4]],
    downtown: [[8.4, 500, 3, 2], [-6.9, -500, 3, 2]],
    sierra: [[8.4, 11.2, 1, 1], [11.2, 330, 14, 5], [-6.9, -9.7, 1, 1], [-9.7, -330, 14, 5]],
  };
  // Height of the actual terrain mesh (not the smooth function) so props sit on the ground.
  function groundAt(key, x, zl) {
    const H = HEIGHT[key];
    for (const [x0, x1, nx, nz] of TERRAIN[key]) {
      if (x < Math.min(x0, x1) || x > Math.max(x0, x1)) continue;
      const fu = ((x - x0) / (x1 - x0)) * nx, i = Math.min(nx - 1, Math.floor(fu)), u = fu - i;
      const cz = 100 / nz, fv = zl / cz, j = Math.min(nz - 1, Math.floor(fv)), v = fv - j;
      const xa = x0 + ((x1 - x0) * i) / nx, xb = x0 + ((x1 - x0) * (i + 1)) / nx, za = j * cz, zb = (j + 1) * cz;
      const hA = H(xa, za), hB = H(xb, za), hC = H(xb, zb), hD = H(xa, zb);
      return u >= v ? hA + (hB - hA) * u + (hC - hB) * v : hA + (hC - hD) * u + (hD - hA) * v;
    }
    return H(x, zl);
  }

  // Low-poly terrain strip for one 100 m chunk, z from 0 to -100.
  function terrain(x0, x1, nx, nz, hfn, cfn) {
    const pos = [], col = [];
    const c = new T.Color();
    const vx = (i) => x0 + ((x1 - x0) * i) / nx;
    const vz = (j) => -(100 * j) / nz;
    const push = (x, z, k) => {
      const y = hfn(x, -z);
      pos.push(x, y, z);
      cfn(x, y, k, c);
      col.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const xa = vx(i), xb = vx(i + 1), za = vz(j), zb = vz(j + 1);
        const k1 = Math.random(), k2 = Math.random();
        // ensure upward-facing winding whichever way x runs
        if (x1 > x0) {
          push(xa, za, k1); push(xb, za, k1); push(xb, zb, k1);
          push(xa, za, k2); push(xb, zb, k2); push(xa, zb, k2);
        } else {
          push(xa, za, k1); push(xb, zb, k1); push(xb, za, k1);
          push(xa, za, k2); push(xa, zb, k2); push(xb, zb, k2);
        }
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
  const flatColor = (hex, jitter = 0.04) => {
    const base = new T.Color(hex);
    return (x, y, k, c) => { c.copy(base).offsetHSL(0, 0, (k - 0.5) * jitter); };
  };

  function guardrail(x, faceSign) {
    const p = [G.part(G.box(0.1, 0.34, 100), 0xa8adb1, x, 0.64, -50)];
    for (let z = 0; z < 100; z += 4) p.push(G.part(G.box(0.15, 0.78, 0.15), 0x7d8186, x + faceSign * 0.14, 0.39, -z - 2));
    return p;
  }
  function soundWall(x) {
    const p = [G.part(G.box(0.45, 4.6, 100), 0x7a7772, x, 2.3, -50), G.part(G.box(0.62, 0.22, 100), 0x8c8984, x, 4.7, -50)];
    for (let z = 0; z < 100; z += 5) p.push(G.part(G.box(0.5, 4.6, 0.14), 0x5f5d59, x, 2.3, -z - 2.5));
    return p;
  }
  // ---------------------------------------------------------------- backdrops
  function noise1(seed) {
    const r = EZ.rng(seed);
    const w = [];
    for (let i = 0; i < 5; i++) w.push([r() * 6.28, 1 + i * 1.9 + r(), 1 / (i + 1)]);
    return (t) => {
      let v = 0, n = 0;
      for (const [ph, f, a] of w) { v += Math.sin(t * f + ph) * a; n += a; }
      return v / n;
    };
  }
  function ridge(radius, heights, colTop, colBottom, snowAbove) {
    // heights: array of [theta, h]
    const pos = [], col = [];
    const top = new T.Color(colTop), bot = new T.Color(colBottom), snow = new T.Color('#eef2f4'), c = new T.Color();
    const pt = (th, y) => [Math.sin(th) * radius, y, -Math.cos(th) * radius];
    for (let i = 0; i < heights.length - 1; i++) {
      const [ta, ha] = heights[i], [tb, hb] = heights[i + 1];
      const A0 = pt(ta, -30), A1 = pt(ta, ha), B0 = pt(tb, -30), B1 = pt(tb, hb);
      const ca = snowAbove && ha > snowAbove ? c.copy(top).lerp(snow, Math.min(1, (ha - snowAbove) / 30)).clone() : top;
      const cb = snowAbove && hb > snowAbove ? c.copy(top).lerp(snow, Math.min(1, (hb - snowAbove) / 30)).clone() : top;
      for (const [p, cc] of [[A0, bot], [B0, bot], [B1, cb], [A0, bot], [B1, cb], [A1, ca]]) {
        pos.push(p[0], p[1], p[2]);
        col.push(cc.r, cc.g, cc.b);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return g;
  }

  // ---------------------------------------------------------------- sign artwork
  const FONT = 'Overpass, "Arial Narrow", Arial, sans-serif';
  function fitFont(c, text, weight, size, maxW) {
    let s = size;
    c.font = `${weight} ${s}px ${FONT}`;
    while (c.measureText(text).width > maxW && s > 20) { s -= 4; c.font = `${weight} ${s}px ${FONT}`; }
    return s;
  }
  function drawGuide(cv, panel) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#0E6B4E'; G.roundRect(c, 0, 0, W, H, 34); c.fill();
    c.strokeStyle = '#F4F6F2'; c.lineWidth = 12; G.roundRect(c, 20, 20, W - 40, H - 40, 24); c.stroke();
    c.fillStyle = '#F4F6F2';
    c.textBaseline = 'alphabetic';
    if (panel.title) {
      fitFont(c, panel.title, 800, 132, W - 160);
      c.textAlign = 'center';
      c.fillText(panel.title, W / 2, 210);
      c.font = `600 70px ${FONT}`;
      c.fillText(panel.sub || '', W / 2, 330);
      return;
    }
    const rows = panel.rows;
    rows.forEach(([name, dist], i) => {
      const y = rows.length === 1 ? 262 : 186 + i * 150;
      c.font = `800 104px ${FONT}`;
      c.textAlign = 'right';
      const dw = c.measureText(dist).width;
      c.fillText(dist, W - 70, y);
      c.textAlign = 'left';
      fitFont(c, name, 800, 112, W - 200 - dw);
      c.fillText(name, 70, y);
    });
  }
  function drawVMS(cv, lines) {
    const cols = 72, rows = 20;
    const small = drawVMS.small || (drawVMS.small = G.canvas(cols, rows));
    const sc = small.getContext('2d');
    sc.fillStyle = '#000'; sc.fillRect(0, 0, cols, rows);
    sc.fillStyle = '#fff'; sc.textAlign = 'center'; sc.textBaseline = 'middle';
    let px = 9;
    sc.font = `800 ${px}px ${FONT}`;
    while (px > 6 && Math.max(...lines.map((l) => sc.measureText(l).width)) > cols - 3) { px -= 0.5; sc.font = `800 ${px}px ${FONT}`; }
    if (lines.length === 1) sc.fillText(lines[0], cols / 2, rows / 2 + 0.5);
    else { sc.fillText(lines[0], cols / 2, 5.5); sc.fillText(lines[1], cols / 2, 15); }
    const data = sc.getImageData(0, 0, cols, rows).data;
    const c = cv.getContext('2d'), S = cv.width / cols;
    c.fillStyle = '#0d0c0b'; c.fillRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const on = data[(y * cols + x) * 4] > 105;
        c.fillStyle = on ? '#ffb23c' : '#2a1d0e';
        c.beginPath();
        c.arc(x * S + S / 2, y * S + S / 2, S * (on ? 0.4 : 0.32), 0, PI * 2);
        c.fill();
      }
    }
  }
  const ADS = [
    { bg: '#1B4C8C', fg: '#F6F7F3', a: 'Volt Stop', b: 'Fast charging at exit 41' },
    { bg: '#FFC72C', fg: '#17191B', a: 'Visit Mars', b: 'Plenty of parking' },
    { bg: '#F6F7F3', fg: '#C8102E', a: "Ray's Donuts", b: 'Open all night. Cruisers welcome.' },
    { bg: '#C8102E', fg: '#F6F7F3', a: 'Need a lawyer?', b: '1-800-PULL-OVR' },
    { bg: '#17191B', fg: '#FFC72C', a: 'Zero to sixty', b: 'in less time than this ad' },
  ];
  function drawAd(ad) {
    const cv = G.canvas(768, 288), c = cv.getContext('2d');
    c.fillStyle = ad.bg; c.fillRect(0, 0, 768, 288);
    c.fillStyle = ad.fg; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    fitFont(c, ad.a, 900, 130, 700);
    c.fillText(ad.a, 36, 150);
    fitFont(c, ad.b, 600, 52, 700);
    c.fillText(ad.b, 38, 232);
    return new T.CanvasTexture(cv);
  }

  // ================================================================ World
  class World {
    constructor(game) {
      this.g = game;
      const scene = (this.scene = game.scene);
      this.mats = EZ.Models.mats();
      this.night = 0;
      this.envKey = '';
      this.prep();
      this.buildSky();
      this.buildLights();
      this.buildRoad();
      this.buildChunks();
      this.buildBackdrops();
      this.buildScenery();
      this.buildGantries();
      this.apply(0);
      scene.fog = this.fog;
    }

    // ---- palettes
    prep() {
      const col = (h) => new T.Color(h);
      for (const b of EZ.BIOMES) {
        b.c = {
          top: col(b.sky.top), horizon: col(b.sky.horizon), bottom: col(b.sky.bottom), sun: col(b.sky.sun),
          fog: col(b.fog.color), hemiSky: col(b.light.sky), hemiGround: col(b.light.ground), dir: col(b.light.dir),
          sunDir: new T.Vector3(...b.sky.dir).normalize(),
        };
      }
      this.pal = {
        top: new T.Color(), horizon: new T.Color(), bottom: new T.Color(), sun: new T.Color(), fog: new T.Color(),
        hemiSky: new T.Color(), hemiGround: new T.Color(), dir: new T.Color(), sunDir: new T.Vector3(),
        near: 80, far: 380, hemi: 1, dirI: 1, night: 0, size: 0.05, glow: 0.6,
      };
    }
    blendAt(s) {
      const L = C.BIOME_LEN, n = EZ.BIOMES.length;
      const idx = Math.floor(s / L);
      const t = s / L - idx;
      const a = EZ.BIOMES[((idx % n) + n) % n], b = EZ.BIOMES[(((idx + 1) % n) + n) % n];
      return { a, b, f: EZ.smoothstep(0.86, 1.0, t), idx };
    }
    biomeAt(s) {
      const { a, b, f } = this.blendAt(s);
      return f > 0.5 ? b : a;
    }
    apply(s) {
      const { a, b, f } = this.blendAt(s);
      const P = this.pal, A = a.c, B = b.c;
      for (const k of ['top', 'horizon', 'bottom', 'sun', 'fog', 'hemiSky', 'hemiGround', 'dir']) P[k].copy(A[k]).lerp(B[k], f);
      P.sunDir.copy(A.sunDir).lerp(B.sunDir, f).normalize();
      P.near = EZ.lerp(a.fog.near, b.fog.near, f);
      P.far = EZ.lerp(a.fog.far, b.fog.far, f);
      P.hemi = EZ.lerp(a.light.hemi, b.light.hemi, f);
      P.dirI = EZ.lerp(a.light.dirI, b.light.dirI, f);
      P.night = EZ.lerp(a.night, b.night, f);
      P.size = EZ.lerp(a.sky.size, b.sky.size, f);
      P.glow = EZ.lerp(a.sky.glow, b.sky.glow, f);
      this.blend = { a, b, f };
      this.night = P.night;

      const u = this.sky.material.uniforms;
      u.uTop.value.copy(P.top); u.uHorizon.value.copy(P.horizon); u.uBottom.value.copy(P.bottom);
      u.uSun.value.copy(P.sun); u.uSunDir.value.copy(P.sunDir); u.uSunSize.value = P.size; u.uGlow.value = P.glow;
      this.fog.color.copy(P.fog); this.fog.near = P.near; this.fog.far = P.far;
      this.hemi.color.copy(P.hemiSky); this.hemi.groundColor.copy(P.hemiGround); this.hemi.intensity = P.hemi;
      this.sun.color.copy(P.dir); this.sun.intensity = P.dirI;
      this.g.renderer.setClearColor(P.fog);

      // night-time furniture
      const n = P.night;
      this.mats.lamp.color.setRGB(EZ.lerp(0.75, 1.0, n), EZ.lerp(0.74, 0.86, n), EZ.lerp(0.7, 0.6, n));
      this.mats.pool.opacity = EZ.smoothstep(0.3, 1, n) * 0.5;
      this.buildingMat.emissiveIntensity = EZ.smoothstep(0.25, 0.9, n) * 0.8;
      this.signEmissive = 0.15 + n * 0.55;
      this.starMat.opacity = EZ.smoothstep(0.6, 1, n) * 0.85;
      this.skylineDots.material.opacity = EZ.smoothstep(0.5, 1, n);
      for (const gtry of this.gantries) for (const m of gtry.signMats || []) m.emissiveIntensity = this.signEmissive;
      for (const bb of this.billboards) bb.panel.material.emissiveIntensity = 0.1 + n * 0.8;

      // backdrop crossfade
      for (const bd of this.backdrops) {
        const w = bd.key === a.key ? 1 - f : bd.key === b.key ? f : 0;
        bd.group.visible = w > 0.01;
        for (const m of bd.mats) m.opacity = w;
      }
      this.envKey = f < 0.5 ? a.key : b.key;
    }

    // ---- builders
    buildSky() {
      const mat = new T.ShaderMaterial({
        uniforms: {
          uTop: { value: new T.Color() }, uHorizon: { value: new T.Color() }, uBottom: { value: new T.Color() },
          uSun: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 0.1, -1) }, uSunSize: { value: 0.05 }, uGlow: { value: 0.6 },
        },
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: T.BackSide, depthWrite: false, depthTest: false,
      });
      this.sky = new T.Mesh(new T.SphereGeometry(1000, 32, 16), mat);
      this.sky.renderOrder = -10;
      this.sky.frustumCulled = false;
      this.scene.add(this.sky);
      this.fog = new T.Fog(0xffffff, 80, 380);

      const n = 700, p = new Float32Array(n * 3), r = EZ.rng(11);
      for (let i = 0; i < n; i++) {
        const th = r() * PI * 2, ph = Math.acos(1 - r() * 0.95);
        p[i * 3] = Math.sin(ph) * Math.cos(th) * 900;
        p[i * 3 + 1] = Math.cos(ph) * 900;
        p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 900;
      }
      const sg = new T.BufferGeometry();
      sg.setAttribute('position', new T.BufferAttribute(p, 3));
      this.starMat = new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
      this.stars = new T.Points(sg, this.starMat);
      this.stars.renderOrder = -9;
      this.stars.frustumCulled = false;
      this.scene.add(this.stars);
    }
    buildLights() {
      this.hemi = new T.HemisphereLight(0xffffff, 0x444444, 1);
      this.scene.add(this.hemi);
      this.sun = new T.DirectionalLight(0xffffff, 1);
      this.scene.add(this.sun);
      this.scene.add(this.sun.target);
    }
    buildRoad() {
      const tex = G.roadTexture(this.g.renderer);
      this.roadLen = 960;
      tex.repeat.set(1, this.roadLen / 12);
      const mat = new T.MeshLambertMaterial({ map: tex });
      const w = G.ROAD_X1 - G.ROAD_X0;
      const geo = new T.PlaneGeometry(w, this.roadLen);
      geo.rotateX(-PI / 2);
      this.road = new T.Mesh(geo, mat);
      this.road.position.x = (G.ROAD_X0 + G.ROAD_X1) / 2;
      this.road.renderOrder = -1;
      this.scene.add(this.road);
    }
    buildChunks() {
      const vc = this.mats.vc;
      const geos = {};
      // Pacific: cliff-top strip and ocean on the right, coastal hills on the left
      geos.pacific = G.merge([
        { g: terrain(8.4, 11.2, 1, 1, () => 0, flatColor('#A6925D')), c: null },
        { g: terrain(11.2, 14.2, 1, 1, (x) => (x < 12.2 ? 0 : -14), flatColor('#8C7357')), c: null },
        { g: terrain(14.2, 1900, 1, 1, () => -14, flatColor('#2F6A8C', 0)), c: null },
        { g: terrain(-6.9, -420, 16, 5, HEIGHT.pacific, (x, y, k, c) => c.set('#A9955F').lerp(new T.Color(k > 0.55 ? '#6F6B3F' : '#8A7B4C'), Math.min(1, y / 45)).offsetHSL(0, 0, (k - 0.5) * 0.06)), c: null },
        ...guardrail(8.75, 1),
        ...guardrail(-7.25, -1),
      ]);
      geos.mojave = G.merge([
        { g: terrain(8.4, 1500, 12, 4, HEIGHT.mojave, flatColor('#BC8660', 0.07)), c: null },
        { g: terrain(-6.9, -1500, 12, 4, HEIGHT.mojave, flatColor('#B98462', 0.07)), c: null },
      ]);
      geos.downtown = G.merge([
        { g: terrain(8.4, 500, 3, 2, () => 0, flatColor('#25282F', 0.05)), c: null },
        { g: terrain(-6.9, -500, 3, 2, () => 0, flatColor('#25282F', 0.05)), c: null },
        ...soundWall(9.15),
        ...soundWall(-7.6),
      ]);
      const snowy = (x, y, k, c) => {
        c.set('#55654A').lerp(new T.Color('#46553F'), k);
        if (y > 22 && k > 0.45) c.lerp(new T.Color('#E4EAEC'), Math.min(1, (y - 22) / 20));
      };
      geos.sierra = G.merge([
        { g: terrain(8.4, 11.2, 1, 1, () => 0, flatColor('#5E6D52')), c: null },
        { g: terrain(11.2, 330, 14, 5, HEIGHT.sierra, snowy), c: null },
        { g: terrain(-6.9, -9.7, 1, 1, () => 0, flatColor('#5E6D52')), c: null },
        { g: terrain(-9.7, -330, 14, 5, HEIGHT.sierra, snowy), c: null },
        ...guardrail(8.75, 1),
        ...guardrail(-7.25, -1),
      ]);
      this.chunkGeos = geos;
      this.chunks = [];
      for (let i = 0; i < 13; i++) {
        const group = new T.Group();
        const meshes = {};
        for (const key of Object.keys(geos)) {
          const m = new T.Mesh(geos[key], vc);
          m.visible = false;
          group.add(m);
          meshes[key] = m;
        }
        this.scene.add(group);
        this.chunks.push({ group, meshes, slot: null });
      }
    }
    buildBackdrops() {
      this.backdrops = [];
      const mk = (key, layers) => {
        const group = new T.Group();
        const mats = [];
        for (const geo of layers) {
          const mat = new T.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 1, depthWrite: false });
          const m = new T.Mesh(geo, mat);
          m.renderOrder = -8;
          m.frustumCulled = false;
          group.add(m);
          mats.push(mat);
        }
        this.scene.add(group);
        const bd = { key, group, mats };
        this.backdrops.push(bd);
        return bd;
      };
      const sample = (n, fn) => {
        const out = [];
        for (let i = 0; i <= n; i++) { const th = -1.9 + (3.8 * i) / n; out.push([th, fn(th)]); }
        return out;
      };
      const B = (key) => EZ.BIOMES.find((b) => b.key === key);
      {
        const b = B('pacific'), n1 = noise1(3), n2 = noise1(9);
        const sea = (th) => EZ.smoothstep(0.15, 0.45, th);
        mk('pacific', [
          ridge(860, sample(140, (th) => (60 + n1(th * 2) * 34) * (1 - sea(th))), b.layers[0], b.fog.color),
          ridge(640, sample(140, (th) => (32 + n2(th * 3) * 22) * (1 - sea(th + 0.12)) - 4), b.layers[1], b.fog.color),
        ]);
      }
      {
        const b = B('mojave'), n1 = noise1(21), n2 = noise1(33);
        const mesa = (fn, hi, lo) => (th) => { const v = fn(th * 2.4); return v > 0.12 ? hi + v * 12 : lo + v * 10; };
        mk('mojave', [
          ridge(880, sample(220, mesa(n1, 58, 10)), b.layers[0], b.fog.color),
          ridge(660, sample(220, mesa(n2, 34, 4)), b.layers[1], b.fog.color),
        ]);
      }
      {
        const b = B('downtown'), r = EZ.rng(5);
        const skyline = (radius, hMin, hMax) => {
          const pts = [];
          let th = -1.9;
          while (th < 1.9) {
            const w = 0.015 + r() * 0.05, h = hMin + Math.pow(r(), 1.8) * (hMax - hMin);
            pts.push([th, h], [th + w, h]);
            th += w + r() * 0.01;
          }
          return pts;
        };
        const far = skyline(880, 20, 190), near = skyline(660, 10, 90);
        mk('downtown', [ridge(880, far, b.layers[0], b.fog.color), ridge(660, near, b.layers[1], b.fog.color)]);
        // lit windows on the far skyline
        const dots = [], cr = EZ.rng(8);
        for (let i = 0; i < far.length - 1; i += 2) {
          const [ta, h] = far[i], tb = far[i + 1][0];
          const count = Math.floor(h / 10);
          for (let k = 0; k < count; k++) {
            if (cr() > 0.4) continue;
            const th = ta + cr() * (tb - ta), y = cr() * h;
            dots.push(Math.sin(th) * 875, y, -Math.cos(th) * 875);
          }
        }
        const dg = new T.BufferGeometry();
        dg.setAttribute('position', new T.Float32BufferAttribute(dots, 3));
        this.skylineDots = new T.Points(dg, new T.PointsMaterial({ color: 0xffd9a0, size: 1.7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
        this.skylineDots.renderOrder = -7;
        this.skylineDots.frustumCulled = false;
        this.backdrops[this.backdrops.length - 1].group.add(this.skylineDots);
      }
      {
        const b = B('sierra'), n1 = noise1(41), n2 = noise1(57);
        const peaks = (fn, base, amp) => (th) => base + Math.pow(Math.abs(fn(th * 3.1)), 0.7) * amp;
        mk('sierra', [
          ridge(880, sample(200, peaks(n1, 50, 140)), b.layers[0], b.fog.color, 120),
          ridge(660, sample(200, peaks(n2, 22, 70)), b.layers[1], b.fog.color, 75),
        ]);
      }
    }
    buildScenery() {
      const scene = this.scene;
      const kinds = EZ.Models.sceneryKinds();
      const caps = { palm: 90, scrub: 170, rock: 220, cactus: 150, joshua: 80, pine: 420, snowpine: 160, pylon: 16, pole: 20, poolPair: 20, delineator: 34, catseye: 220 };
      this.pools = {};
      for (const k of Object.keys(caps)) this.pools[k] = new EZ.Pool(scene, kinds[k], caps[k]);
      const win = G.windowTextures();
      this.buildingMat = new T.MeshLambertMaterial({ map: win.day, emissiveMap: win.lit, emissive: 0xffffff, emissiveIntensity: 0 });
      this.buildingVariants = [[18, 42, 20], [14, 72, 16], [24, 26, 22], [12, 112, 13], [20, 56, 18]];
      this.buildingVariants.forEach((v, i) => {
        this.pools['bld' + i] = new EZ.Pool(scene, [{ geo: EZ.Models.buildingGeo(v[0], v[1], v[2]), mat: this.buildingMat, tint: true }], 34);
      });
      this.placed = [];
      this.nextSlot = -20;
    }
    buildGantries() {
      const scene = this.scene;
      const steel = new T.MeshLambertMaterial({ color: 0x9aa0a6 });
      const dark = new T.MeshLambertMaterial({ color: 0x2c2f33 });
      const frame = () => {
        const g = new T.Group();
        for (const x of [-7.6, 8.9]) {
          const post = new T.Mesh(G.box(0.45, 7.8, 0.45), steel);
          post.position.set(x, 3.9, 0);
          g.add(post);
        }
        for (const y of [7.5, 6.8]) {
          const beam = new T.Mesh(G.box(16.9, 0.18, 0.18), steel);
          beam.position.set(0.65, y, 0);
          g.add(beam);
        }
        const lattice = new T.Mesh(G.merge(Array.from({ length: 18 }, (_, i) => G.part(G.box(0.08, 0.95, 0.08), 0x9aa0a6, -7.6 + i * 0.93, 7.15, 0, 0, 0, i % 2 ? 0.65 : -0.65))), this.mats.vc);
        g.add(lattice);
        return g;
      };
      this.gantries = [];
      for (let i = 0; i < 3; i++) {
        const g = frame();
        const panels = [], signMats = [];
        for (const x of [-3.3, 3.3]) {
          const cv = G.canvas(1024, 448);
          const tex = new T.CanvasTexture(cv);
          const mat = new T.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2, transparent: true });
          const p = new T.Mesh(new T.PlaneGeometry(6.4, 2.8), mat);
          p.position.set(x, 6.15, 0.3);
          g.add(p);
          const back = new T.Mesh(G.box(6.4, 2.8, 0.08), steel);
          back.position.set(x, 6.15, 0.22);
          g.add(back);
          panels.push({ cv, tex, mesh: p });
          signMats.push(mat);
        }
        const tabCv = G.canvas(256, 96);
        const tabTex = new T.CanvasTexture(tabCv);
        const tab = new T.Mesh(new T.PlaneGeometry(1.9, 0.72), new T.MeshLambertMaterial({ map: tabTex, emissive: 0xffffff, emissiveMap: tabTex, emissiveIntensity: 0.2 }));
        tab.position.set(5.3, 7.86, 0.3);
        g.add(tab);
        signMats.push(tab.material);
        g.visible = false;
        scene.add(g);
        this.gantries.push({ kind: 'guide', group: g, panels, tab, tabCv, tabTex, signMats, s: -1e9, live: false });
      }
      for (let i = 0; i < 3; i++) {
        const g = frame();
        const housing = new T.Mesh(G.box(8.2, 2.6, 0.8), dark);
        housing.position.set(0, 6.0, 0);
        g.add(housing);
        const cv = G.canvas(864, 240);
        const tex = new T.CanvasTexture(cv);
        const face = new T.Mesh(new T.PlaneGeometry(7.6, 2.12), new T.MeshBasicMaterial({ map: tex }));
        face.position.set(0, 6.0, 0.41);
        g.add(face);
        g.visible = false;
        scene.add(g);
        this.gantries.push({ kind: 'vms', group: g, cv, tex, s: -1e9, live: false });
      }
      this.gantryQueue = [];

      // overpasses (downtown)
      const concrete = new T.MeshLambertMaterial({ color: 0x8f8d88 });
      const under = new T.MeshLambertMaterial({ color: 0x6c6a66 });
      this.overpasses = [];
      for (let i = 0; i < 3; i++) {
        const g = new T.Group();
        const deck = new T.Mesh(G.box(52, 1.5, 13), concrete);
        deck.position.set(0.8, 7.4, 0);
        const soffit = new T.Mesh(G.box(52, 0.1, 12.6), under);
        soffit.position.set(0.8, 6.62, 0);
        g.add(deck, soffit);
        for (const z of [-6.35, 6.35]) {
          const rail = new T.Mesh(G.box(52, 1.1, 0.3), concrete);
          rail.position.set(0.8, 8.7, z);
          g.add(rail);
        }
        for (const x of [-8.9, 10.8]) {
          const pier = new T.Mesh(G.box(1.4, 6.7, 8), under);
          pier.position.set(x, 3.35, 0);
          g.add(pier);
        }
        const lights = new T.Mesh(G.merge([-3.6, 0, 3.6].map((x) => G.part(G.box(0.8, 0.08, 0.3), 0xffffff, x, 6.55, 0))), this.mats.lamp);
        g.add(lights);
        g.visible = false;
        scene.add(g);
        this.overpasses.push({ group: g, s: -1e9, live: false });
      }

      // billboards
      this.adTex = ADS.map(drawAd);
      this.billboards = [];
      for (let i = 0; i < 4; i++) {
        const g = new T.Group();
        for (const x of [-3.5, 3.5]) {
          const post = new T.Mesh(G.box(0.5, 9, 0.5), steel);
          post.position.set(x, 4.5, 0);
          g.add(post);
        }
        const panel = new T.Mesh(new T.PlaneGeometry(12, 4.5), new T.MeshLambertMaterial({ map: this.adTex[i % this.adTex.length], emissive: 0xffffff, emissiveMap: this.adTex[i % this.adTex.length], emissiveIntensity: 0.1 }));
        panel.position.set(0, 9.6, 0.32);
        const back = new T.Mesh(G.box(12.3, 4.8, 0.3), dark);
        back.position.set(0, 9.6, 0.1);
        const walk = new T.Mesh(G.box(12, 0.12, 0.9), steel);
        walk.position.set(0, 7.3, 0.6);
        g.add(panel, back, walk);
        g.visible = false;
        scene.add(g);
        this.billboards.push({ group: g, panel, s: -1e9, live: false });
      }
    }
    refreshArt() {
      // called once web fonts are ready so canvas text uses Overpass
      this.adTex.forEach((t, i) => {
        const fresh = drawAd(ADS[i]);
        t.image = fresh.image;
        t.needsUpdate = true;
      });
    }
    // ---- placement API (used by the planner)
    addGantry(kind, s, data) {
      this.gantryQueue.push({ kind, s, data });
      this.gantryQueue.sort((a, b) => a.s - b.s);
    }
    spawnGantry(q) {
      const g = this.gantries.find((x) => x.kind === q.kind && !x.live);
      if (!g) return;
      g.live = true; g.s = q.s;
      g.group.position.set(0, 0, -q.s);
      g.group.visible = true;
      if (q.kind === 'guide') {
        const d = q.data;
        drawGuide(g.panels[0].cv, d.left);
        drawGuide(g.panels[1].cv, d.right);
        g.panels[0].tex.needsUpdate = g.panels[1].tex.needsUpdate = true;
        g.tab.visible = !!d.tab;
        if (d.tab) {
          const c = g.tabCv.getContext('2d');
          c.clearRect(0, 0, 256, 96);
          c.fillStyle = '#0E6B4E'; G.roundRect(c, 0, 0, 256, 120, 18); c.fill();
          c.strokeStyle = '#F4F6F2'; c.lineWidth = 7; G.roundRect(c, 10, 10, 236, 120, 12); c.stroke();
          c.fillStyle = '#F4F6F2'; c.font = `800 52px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(d.tab, 128, 56);
          g.tabTex.needsUpdate = true;
        }
      } else {
        drawVMS(g.cv, q.data.lines);
        g.tex.needsUpdate = true;
      }
    }
    guideFor(s) {
      const b = this.biomeAt(s);
      const pool = EZ.shuffle(b.signs.slice());
      const joke = Math.random() < 0.28;
      return {
        left: { rows: [pool[0], pool[1]] },
        right: joke ? { title: 'No exit', sub: 'Keep driving' } : { rows: [pool[2]] },
        tab: joke ? 'EXIT 0' : Math.random() < 0.5 ? `EXIT ${EZ.randi(12, 96)}` : null,
      };
    }

    // ---- per-frame
    update(sp, dt, camera) {
      this.apply(sp);
      const cam = camera.position;
      this.sky.position.copy(cam);
      this.stars.position.copy(cam);
      for (const bd of this.backdrops) bd.group.position.set(cam.x, 0, cam.z);
      const d = this.pal.sunDir;
      this.sun.position.set(cam.x + d.x * 80, 70, cam.z + d.z * 80);
      this.sun.target.position.set(cam.x, 0, cam.z - 20);

      // road follows in whole 12 m steps so the paint never slides
      const snap = Math.floor(sp / 12) * 12;
      const zc = -snap - (this.roadLen / 2 - 180);
      this.road.position.z = zc;

      this.updateChunks(sp);
      this.updateScenery(sp);
      this.updateGantries(sp);
      for (const k in this.pools) this.pools[k].flush();
    }
    updateChunks(sp) {
      const first = Math.floor((sp - 260) / 100), last = Math.floor((sp + 820) / 100);
      for (const ch of this.chunks) {
        if (ch.slot !== null && (ch.slot < first || ch.slot > last)) { ch.slot = null; ch.group.visible = false; }
      }
      for (let i = first; i <= last; i++) {
        if (this.chunks.some((c) => c.slot === i)) continue;
        const ch = this.chunks.find((c) => c.slot === null);
        if (!ch) break;
        ch.slot = i;
        ch.group.visible = true;
        ch.group.position.z = -i * 100;
        const key = this.biomeAt(i * 100 + 50).key;
        for (const k in ch.meshes) ch.meshes[k].visible = k === key;
      }
    }
    put(kind, x, y, s, rot = 0, scale = 1) {
      const pool = this.pools[kind];
      const id = pool.alloc();
      if (id < 0) return -1;
      pool.set(id, x, y, -s, rot, 0, 0, scale);
      this.placed.push({ pool, id, s });
      return id;
    }
    updateScenery(sp) {
      const SL = 12;
      while (this.nextSlot * SL < sp + C.VIEW + 30) {
        this.populate(this.nextSlot, this.nextSlot * SL);
        this.nextSlot++;
      }
      let n = 0;
      while (n < this.placed.length && this.placed[n].s < sp - 240) { const p = this.placed[n]; p.pool.release(p.id); n++; }
      if (n) this.placed.splice(0, n);
    }
    // Region of the 100 m terrain chunk that contains s, so props always match the ground.
    chunkBiome(s) { return this.biomeAt(Math.floor(s / 100) * 100 + 50); }
    populate(i, s0) {
      const SL = 12;
      const b = this.chunkBiome(s0 + 6), key = b.key;
      const r = EZ.rng((i * 2654435761) ^ 0x9e37);
      const zl = (s) => ((s % 100) + 100) % 100;
      const H = (x, z) => groundAt(key, x, z);
      const at = (kind, x, s, rot, sc, y) => this.put(kind, x, y == null ? H(x, zl(s)) - 0.15 * (sc || 1) : y, s, rot, sc);

      // lane furniture everywhere
      for (const x of [-1.8, 1.8]) at('catseye', x, s0 + 1.5, 0, 1, 0);
      if (i % 3 === 0 && key !== 'downtown') at('delineator', 8.2, s0 + 2, 0, 1, 0);
      if (i % 5 === 0 && (key === 'pacific' || key === 'downtown')) {
        at('pole', -7.7, s0 + 4, 0, 1, 0);
        at('poolPair', -7.7, s0 + 4, 0, 1, 0);
      }

      if (key === 'pacific') {
        if (r() < 0.55) at('palm', -11.7 - r() * 46, s0 + r() * 12, r() * 6.3, 0.85 + r() * 0.45);
        if (r() < 0.85) at('scrub', -12.7 - r() * 140, s0 + r() * 12, r() * 6.3, 1 + r() * 1.6);
        if (r() < 0.5) at('rock', -14.7 - r() * 160, s0 + r() * 12, r() * 6.3, 1.4 + r() * 3.2);
        if (r() < 0.14) at('palm', 10.8, s0 + r() * 12, r() * 6.3, 0.8 + r() * 0.3, 0);
        if (r() < 0.32) at('rock', 9.8 + r() * 1.8, s0 + r() * 12, r() * 6.3, 0.5 + r() * 0.6, 0);
        if (r() < 0.06) at('rock', 68 + r() * 360, s0 + r() * 12, r() * 6.3, 7 + r() * 16, -16);
      } else if (key === 'mojave') {
        for (const side of [-1, 1]) {
          const x0 = side > 0 ? 11.2 : -9.7;
          if (r() < 0.5) at('cactus', x0 + side * r() * 150, s0 + r() * 12, r() * 6.3, 0.75 + r() * 0.5);
          if (r() < 0.35) at('joshua', x0 + side * (6 + r() * 150), s0 + r() * 12, r() * 6.3, 0.8 + r() * 0.5);
          if (r() < 0.7) at('scrub', x0 + side * r() * 170, s0 + r() * 12, r() * 6.3, 0.5 + r() * 0.7);
          if (r() < 0.45) at('rock', x0 + side * (4 + r() * 180), s0 + r() * 12, r() * 6.3, 0.8 + r() * 2.4);
        }
        // one tower every 80 m, wires run back to the previous one
        const tower = Math.ceil(s0 / 80) * 80;
        if (tower < s0 + SL) at('pylon', 46.2, tower, 0, 1, 0);
        if (i % 31 === 0) this.placeBillboard(s0 + 6, 20.2, 0);
      } else if (key === 'downtown') {
        if (i % 2 === 0) {
          for (const side of [-1, 1]) {
            if (r() < 0.12) continue;
            const v = (r() * this.buildingVariants.length) | 0;
            const [w] = this.buildingVariants[v];
            const x = side > 0 ? 14.2 + w / 2 + r() * 30 : -12.7 - w / 2 - r() * 40;
            const pool = this.pools['bld' + v];
            const id = pool.alloc();
            if (id >= 0) {
              pool.set(id, x, 0, -(s0 + 12), 0, 0, 0, 1);
              const shade = 0.55 + r() * 0.45;
              pool.tint(id, new T.Color().setRGB(shade * (0.92 + r() * 0.1), shade * (0.92 + r() * 0.08), shade));
              this.placed.push({ pool, id, s: s0 + 12 });
            }
          }
        }
        if (i % 22 === 7) this.placeOverpass(s0 + 6);
        if (i % 26 === 13) this.placeBillboard(s0 + 6, 12.7, 4);
      } else if (key === 'sierra') {
        for (const side of [-1, 1]) {
          const x0 = side > 0 ? 11.2 : -9.7;
          const n = 2 + ((r() * 3) | 0);
          for (let k = 0; k < n; k++) {
            const x = x0 + side * (1.5 + Math.pow(r(), 0.8) * 120);
            const y = H(x, zl(s0));
            at(y > 18 && r() < 0.6 ? 'snowpine' : 'pine', x, s0 + r() * 12, r() * 6.3, 0.8 + r() * 0.7);
          }
          if (r() < 0.35) at('rock', x0 + side * (2 + r() * 90), s0 + r() * 12, r() * 6.3, 1 + r() * 3);
        }
        if (r() < 0.25) at('rock', 10.0 + r() * 1.2, s0 + r() * 12, r() * 6.3, 0.4 + r() * 0.5, 0);
      }
    }
    placeOverpass(s) {
      const o = this.overpasses.find((x) => !x.live);
      if (!o) return;
      o.live = true; o.s = s;
      o.group.position.z = -s;
      o.group.visible = true;
    }
    placeBillboard(s, x, y) {
      const b = this.billboards.find((q) => !q.live);
      if (!b) return;
      b.live = true; b.s = s;
      b.group.position.set(x, y, -s);
      b.group.rotation.y = -0.35;
      const tex = EZ.pick(this.adTex);
      b.panel.material.map = tex; b.panel.material.emissiveMap = tex; b.panel.material.needsUpdate = true;
      b.group.visible = true;
    }
    updateGantries(sp) {
      while (this.gantryQueue.length && this.gantryQueue[0].s < sp + C.VIEW + 60) {
        const q = this.gantryQueue.shift();
        if (q.s > sp - 10) this.spawnGantry(q);
      }
      for (const list of [this.gantries, this.overpasses, this.billboards]) {
        for (const g of list) {
          if (g.live && g.s < sp - 260) { g.live = false; g.group.visible = false; }
        }
      }
    }
    reset(s = 0) {
      for (const p of this.placed) p.pool.release(p.id);
      this.placed = [];
      this.nextSlot = Math.floor((s - 240) / 12);
      for (const ch of this.chunks) { ch.slot = null; ch.group.visible = false; }
      for (const list of [this.gantries, this.overpasses, this.billboards]) for (const g of list) { g.live = false; g.group.visible = false; }
      this.gantryQueue = [];
    }
  }
  World.HEIGHT = HEIGHT;
  EZ.World = World;
})();
