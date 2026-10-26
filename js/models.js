/* Zero Sixty: every vehicle and roadside object, built from primitives at load time. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE, G = EZ.Geo;
  const Models = (EZ.Models = {});
  const PI = Math.PI;

  // ---------------------------------------------------------------- shared materials
  let M = null;
  Models.mats = function () {
    if (M) return M;
    const glow = G.glowTexture(), blob = G.blobTexture();
    const additive = (color, opacity) => new T.MeshBasicMaterial({
      map: glow, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide,
    });
    M = {
      glow, blob,
      vc: new T.MeshLambertMaterial({ vertexColors: true }),
      paint: new T.MeshLambertMaterial({ vertexColors: true }),
      lights: new T.MeshBasicMaterial({ vertexColors: true }),
      shadow: new T.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      copRed: new T.MeshBasicMaterial({ color: 0xff1a2e }),
      copBlue: new T.MeshBasicMaterial({ color: 0x2f5dff }),
      copGlowRed: additive(0xff2038, 0),
      copGlowBlue: additive(0x3a66ff, 0),
      amber: new T.MeshBasicMaterial({ color: 0xffa630 }),
      lamp: new T.MeshBasicMaterial({ color: 0xd8d4c8 }),
      pool: additive(0xffb867, 0),
      headGlow: additive(0xfff3da, 0),
      volt: new T.MeshLambertMaterial({ color: 0xffc72c, emissive: 0x7a5200 }),
      additive,
    };
    return M;
  };

  const interp = (xs, ys, x) => {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) {
        const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
        return ys[i - 1] + (ys[i] - ys[i - 1]) * t * t * (3 - 2 * t);
      }
    }
    return ys[ys.length - 1];
  };

  // ================================================================ the Roadster
  // Car space: x is width, y is up, the nose points to -z. Wheelbase 2.62 m.
  //
  // The body is lofted. At each station along the car a cross-section is built from a handful
  // of curves (half width, floor, shoulder and centre-line heights, the wheel arches), and the
  // stations are stitched into one smooth surface: crowned front fenders with the bonnet dipping
  // between them, a pinched waist, wide haunches over the rear wheels and a rounded tail.
  const AXLE_F = -1.32, AXLE_R = 1.3;
  // smooth curve through keyframes (Hermite, tangents from the neighbours)
  const spline = (xs, ys) => {
    const n = xs.length, m = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      m[i] = (ys[b] - ys[a]) / (xs[b] - xs[a]);
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  };
  const BODY = {
    zN: -2.28, zT: 2.24,
    W: spline([-2.28, -2.24, -2.16, -2.0, -1.75, -1.32, -0.95, -0.45, 0.1, 0.6, 1.0, 1.3, 1.65, 1.95, 2.12, 2.2, 2.24],
      [0.5, 0.62, 0.73, 0.84, 0.93, 0.975, 0.935, 0.895, 0.9, 0.95, 1.0, 1.015, 1.0, 0.95, 0.89, 0.83, 0.76]),
    B: spline([-2.28, -2.22, -2.1, -1.9, 1.5, 1.85, 2.08, 2.2, 2.24], [0.31, 0.25, 0.2, 0.17, 0.17, 0.19, 0.23, 0.27, 0.31]),
    S: spline([-2.28, -2.24, -2.16, -2.0, -1.75, -1.32, -1.0, -0.5, 0.0, 0.6, 1.0, 1.3, 1.7, 2.0, 2.15, 2.22, 2.24],
      [0.35, 0.43, 0.51, 0.61, 0.74, 0.845, 0.81, 0.78, 0.79, 0.85, 0.9, 0.92, 0.9, 0.86, 0.8, 0.7, 0.6]),
    C: spline([-2.28, -2.24, -2.16, -2.0, -1.75, -1.32, -0.95, -0.6, 0.0, 0.6, 1.0, 1.4, 1.8, 2.05, 2.18, 2.24],
      [0.35, 0.43, 0.505, 0.58, 0.62, 0.67, 0.73, 0.78, 0.8, 0.82, 0.84, 0.86, 0.85, 0.82, 0.76, 0.6]),
    // height of the widest point of the flank
    U: spline([-2.28, -2.0, -1.5, 0, 1.6, 2.1, 2.24], [0.32, 0.38, 0.44, 0.46, 0.5, 0.52, 0.5]),
    arches: [{ z: AXLE_F, y: 0.34, R: 0.43 }, { z: AXLE_R, y: 0.355, R: 0.445 }],
  };
  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  // Half cross-section (x >= 0) at station z: the dark floor and wheel well, then the painted
  // flank and top running round to the centre line.
  function bodySection(z) {
    const W = BODY.W(z), yB = BODY.B(z), yS = BODY.S(z), yC = BODY.C(z);
    const yU = EZ.clamp(BODY.U(z), yB + 0.04, yS - 0.04);
    let yA = yB + 0.02;
    for (const a of BODY.arches) {
      const dz = z - a.z, reach = Math.sqrt(Math.max(0, a.R * a.R - (yB - a.y) * (yB - a.y)));
      if (Math.abs(dz) < reach) yA = Math.max(yA, a.y + Math.sqrt(a.R * a.R - dz * dz));
    }
    const P0 = [W * 0.9, yB + 0.03], P1 = [W * 1.02, yU - 0.12], P2 = [W * 1.02, yU + 0.14], P3 = [W * 0.955, yS];
    // the flank starts above the arch opening, if there is one at this station
    let t0 = 0;
    if (yA > P0[1]) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (bez(P0, P1, P2, P3, mid)[1] < yA) lo = mid; else hi = mid; }
      t0 = Math.min(0.97, hi);
    }
    const side = [];
    const NS = 13;
    for (let i = 0; i < NS; i++) {
      const p = bez(P0, P1, P2, P3, t0 + ((1 - t0) * i) / (NS - 1));
      // the scoop ahead of the rear wheel that feeds air to the fans
      const bz = EZ.smoothstep(0.18, 0.42, z) * (1 - EZ.smoothstep(0.7, 0.9, z));
      const by = EZ.smoothstep(0.3, 0.4, p[1]) * (1 - EZ.smoothstep(0.56, 0.66, p[1]));
      p[0] -= 0.075 * bz * by;
      side.push(p);
    }
    const NT = 11;
    for (let i = 1; i < NT; i++) side.push(bez(P3, [W * 0.86, yS + 0.035], [W * 0.42, yC], [0, yC], i / (NT - 1)));
    const xIn = Math.max(0.05, W - 0.34);
    let topIn = yC;
    for (let i = NS; i < side.length; i++) if (side[i][0] >= xIn) topIn = side[i][1];
    const yIn = Math.min(yA - 0.01, topIn - 0.05);
    const well = [[0, yB], [xIn * 0.5, yB], [xIn, yB], [xIn, Math.max(yB + 0.01, yIn)], [side[0][0], side[0][1]]];
    return { side, well };
  }
  // Stitch stations of a half section into triangles, mirrored for the other side.
  function loft(stations, key) {
    const pos = [], idx = [];
    const rows = stations.length, cols = stations[0][key].length;
    for (const mirror of [1, -1]) {
      const base = pos.length / 3;
      for (const st of stations) for (const [x, y] of st[key]) pos.push(x * mirror, y, st.z);
      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const a = base + i * cols + j, b = a + cols, c = b + 1, d = a + 1;
          if (mirror > 0) idx.push(a, d, b, b, d, c);
          else idx.push(a, b, d, b, c, d);
        }
      }
    }
    return { pos, idx };
  }
  function buildBody() {
    const zs = [];
    for (let z = BODY.zN; z < BODY.zT; ) {
      zs.push(z);
      let step = 0.07;
      for (const a of BODY.arches) if (Math.abs(z - a.z) < a.R + 0.06) step = 0.035;
      if (z < BODY.zN + 0.3 || z > BODY.zT - 0.28) step = 0.022;
      z += step;
    }
    zs.push(BODY.zT);
    const st = zs.map((z) => Object.assign({ z }, bodySection(z)));
    const skin = loft(st, 'side'), well = loft(st, 'well');
    // close the nose and the tail with a fan of triangles
    const cap = (s, dirZ) => {
      const ring = [...s.side.slice().reverse().map(([x, y]) => [-x, y]), ...s.side];
      const cx = 0, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
      const base = skin.pos.length / 3;
      skin.pos.push(cx, cy, s.z + dirZ * 0.004);
      for (const [x, y] of ring) skin.pos.push(x, y, s.z);
      for (let i = 0; i < ring.length - 1; i++) {
        if (dirZ > 0) skin.idx.push(base, base + 1 + i, base + 2 + i);
        else skin.idx.push(base, base + 2 + i, base + 1 + i);
      }
    };
    cap(st[0], -1);
    cap(st[st.length - 1], 1);
    const g = new T.BufferGeometry();
    const nSkin = skin.pos.length / 3;
    g.setAttribute('position', new T.Float32BufferAttribute([...skin.pos, ...well.pos], 3));
    g.setIndex([...skin.idx, ...well.idx.map((i) => i + nSkin)]);
    g.addGroup(0, skin.idx.length, 0);
    g.addGroup(skin.idx.length, well.idx.length, 1);
    g.computeVertexNormals();
    return g;
  }
  // The glass canopy: a teardrop bubble from the windscreen back over the fastback.
  const CANOPY = {
    z0: -0.98, z1: 1.2,
    top: spline([-0.98, -0.86, -0.6, -0.3, 0.0, 0.3, 0.6, 0.9, 1.1, 1.2], [0.69, 0.86, 1.0, 1.1, 1.15, 1.14, 1.08, 0.98, 0.9, 0.84]),
    W: spline([-0.98, -0.8, -0.5, -0.1, 0.3, 0.7, 1.0, 1.2], [0.5, 0.62, 0.66, 0.64, 0.6, 0.52, 0.42, 0.28]),
  };
  const canopyBase = (z) => BODY.C(z) - 0.025;
  // point on the canopy at station z, angle th from the sill (0) to the crown (PI / 2)
  function canopyPoint(z, th, side = 1, lift = 0) {
    const n = 2.4, c = Math.cos(th), s = Math.sin(th);
    const top = Math.max(canopyBase(z), CANOPY.top(z)), w = CANOPY.W(z), b = canopyBase(z);
    const x = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = b + (top - b) * Math.pow(Math.abs(s), 2 / n);
    return new T.Vector3(side * (x + lift * c), y + lift * s, z);
  }
  function buildCanopy() {
    const st = [];
    for (let z = CANOPY.z0; z <= CANOPY.z1 + 1e-6; z += 0.05) {
      const pts = [];
      for (let i = 0; i <= 14; i++) { const p = canopyPoint(z, (i / 14) * (PI / 2)); pts.push([p.x, p.y]); }
      st.push({ z, pts });
    }
    const { pos, idx } = loft(st, 'pts');
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // A raised band laid on the canopy (A-pillars, roof rails, the targa hoop). edge(k, e, lift)
  // gives the point for path position k (0..1) and edge e (-1 or 1), lifted off the glass.
  function canopyBand(edge, n) {
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      for (const p of [edge(k, -1, 0.003), edge(k, -1, 0.022), edge(k, 1, 0.022), edge(k, 1, 0.003)]) pos.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
      const a = i * 4 + j, b = a + 4, c = b + 1, d = a + 1;
      idx.push(a, b, d, b, c, d);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Tyre: a lathed profile with rounded shoulders, a bulging sidewall and three tread grooves.
  function tyreGeo(r, w) {
    const rr = r * 0.72, h = w / 2;
    const prof = [
      [rr, -h + 0.014], [r * 0.84, -h - 0.002], [r * 0.94, -h + 0.006], [r - 0.012, -h + 0.024], [r, -h + 0.052],
      [r, -h * 0.5], [r - 0.008, -h * 0.45], [r - 0.008, -h * 0.33], [r, -h * 0.28],
      [r, -0.012], [r - 0.008, -0.006], [r - 0.008, 0.006], [r, 0.012],
      [r, h * 0.28], [r - 0.008, h * 0.33], [r - 0.008, h * 0.45], [r, h * 0.5],
      [r, h - 0.052], [r - 0.012, h - 0.024], [r * 0.94, h - 0.006], [r * 0.84, h + 0.002], [rr, h - 0.014],
    ];
    const g = new T.LatheGeometry(prof.map(([a, b]) => new T.Vector2(a, b)), 40);
    g.rotateZ(PI / 2);
    return g;
  }
  // Rim: five pairs of slim spokes, dished out to a machined lip, centre lock and lug nuts.
  function rimGeo(r, w, side) {
    const rr = r * 0.72, face = side * (w / 2 - 0.035);
    const ps = [];
    ps.push(G.part(new T.TorusGeometry(rr - 0.012, 0.016, 8, 40), 0xd5d9dd, face + side * 0.012, 0, 0, 0, PI / 2, 0));
    ps.push(G.part(new T.TorusGeometry(rr - 0.03, 0.006, 6, 40), 0x6d747b, face + side * 0.004, 0, 0, 0, PI / 2, 0));
    for (let i = 0; i < 5; i++) {
      for (const off of [-0.13, 0.13]) {
        const a = (i / 5) * PI * 2 + off, d = rr * 0.5;
        ps.push(G.part(G.box(0.026, rr * 0.8, 0.038), 0x747c84, face - side * 0.01, Math.cos(a) * d, Math.sin(a) * d, a, 0, side * 0.14));
        ps.push(G.part(G.box(0.004, rr * 0.74, 0.014), 0xd5d9dd, face + side * 0.004, Math.cos(a) * d, Math.sin(a) * d, a, 0, side * 0.14));
      }
    }
    ps.push(G.part(G.cyl(r * 0.19, r * 0.22, 0.05, 20), 0x4a5057, face - side * 0.012, 0, 0, 0, 0, PI / 2));
    ps.push(G.part(G.cyl(r * 0.1, r * 0.13, 0.04, 16), 0xc9ced3, face + side * 0.01, 0, 0, 0, 0, PI / 2));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + PI / 5;
      ps.push(G.part(G.cyl(0.011, 0.011, 0.03, 6), 0xb9bec4, face + side * 0.004, Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16, 0, 0, PI / 2));
    }
    return G.merge(ps);
  }
  // Brake disc, cross-drilled so you can see it turn through the spokes.
  function discGeo(r) {
    const ps = [G.part(new T.RingGeometry(r * 0.2, r * 0.62, 32).rotateY(PI / 2), 0x80868c, 0, 0, 0)];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * PI * 2;
      ps.push(G.part(G.cyl(0.008, 0.008, 0.012, 8), 0x2a2d31, 0.004, Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, 0, 0, PI / 2));
      ps.push(G.part(G.cyl(0.008, 0.008, 0.012, 8), 0x2a2d31, 0.004, Math.cos(a + 0.17) * r * 0.36, Math.sin(a + 0.17) * r * 0.36, 0, 0, PI / 2));
    }
    return G.merge(ps);
  }

  Models.roadster = function (env) {
    // root: road position and heading. rig: pivot at the centre of mass for rolls and flips.
    // chassis: everything that rolls with the car. body: rides on the suspension.
    const root = new T.Group();
    const rig = new T.Group();
    rig.position.y = 0.6;
    root.add(rig);
    const chassis = new T.Group();
    chassis.position.y = -0.6;
    rig.add(chassis);
    const body = new T.Group();
    chassis.add(body);

    const paint = new T.MeshPhysicalMaterial({
      color: 0xb0101e, metalness: 0.45, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 1.2,
    });
    // gold-tinted glass, modelled on a spacesuit visor
    const glass = new T.MeshStandardMaterial({ color: 0x7a5a22, metalness: 0.96, roughness: 0.08, envMap: env, envMapIntensity: 1.4 });
    const satin = new T.MeshStandardMaterial({ color: 0x15171a, metalness: 0.35, roughness: 0.5, envMap: env, envMapIntensity: 0.5 });
    const carbon = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.42, envMap: env, envMapIntensity: 0.6 });
    const rimMat = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.26, envMap: env, envMapIntensity: 1.15 });
    const tireMat = new T.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0, roughness: 0.86 });
    const wellMat = new T.MeshLambertMaterial({ color: 0x0f1012 });
    const barrelMat = new T.MeshBasicMaterial({ color: 0x0d0e0f });
    const headMat = new T.MeshBasicMaterial({ color: 0xeef5ff });
    const tailMat = new T.MeshBasicMaterial({ color: 0xc81022 });
    const blinkMat = new T.MeshBasicMaterial({ color: 0x5a3a10 });
    const nozzleMat = new T.MeshBasicMaterial({ color: 0x2a2d31 });
    const fanGlowMat = new T.MeshBasicMaterial({ color: 0x1b2633 });
    const caliperMat = new T.MeshStandardMaterial({ color: 0xc8102e, metalness: 0.3, roughness: 0.4 });
    const plateMat = new T.MeshBasicMaterial({ map: G.plateTexture() });
    const lensMat = new T.MeshBasicMaterial({ color: 0x0b0d10 });
    const mats = { paint, glass, satin, rimMat, headMat, tailMat, blinkMat, nozzleMat, fanGlowMat };
    const V = (x, y, z) => new T.Vector3(x, y, z);

    // ---- body and canopy
    const bodyMesh = new T.Mesh(buildBody(), [paint, wellMat]);
    body.add(bodyMesh);
    body.add(new T.Mesh(buildCanopy(), glass));

    // body-coloured A-pillars running back as roof rails to the targa hoop
    const frameMat = paint.clone();
    frameMat.side = T.DoubleSide;
    for (const sx of [-1, 1]) {
      const path = (k) => (k < 0.55
        ? [EZ.lerp(-0.92, -0.3, k / 0.55), EZ.lerp(0.1, 0.95, EZ.smoothstep(0, 1, k / 0.55))]
        : [EZ.lerp(-0.3, 0.44, (k - 0.55) / 0.45), EZ.lerp(0.95, 1.04, (k - 0.55) / 0.45)]);
      body.add(new T.Mesh(canopyBand((k, e, lift) => { const [z, th] = path(k); return canopyPoint(z, th + e * 0.055, sx, lift); }, 28), frameMat));
    }
    body.add(new T.Mesh(canopyBand((k, e, lift) => canopyPoint(0.44 + e * 0.05, EZ.lerp(0.06, PI - 0.06, k), 1, lift), 30), frameMat));
    const along = (pts, t, color) => {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) out.push(G.beam(pts[i], pts[i + 1], t, color));
      return out;
    };
    // black seal where the glass meets the body
    const seal = [];
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let z = CANOPY.z0 + 0.04; z <= CANOPY.z1 - 0.06; z += 0.11) pts.push(canopyPoint(z, 0.04, sx, 0.012));
      seal.push(...along(pts, 0.022, 0x0d0e10));
    }

    // ---- carbon trim: splitter, sill blades, diffuser strakes, mirror stalks
    const cf = [];
    cf.push(G.part(G.taperBox(1.06, 0.025, 0.3, 0.92, 0.22), 0x1a1c1f, 0, 0.18, -2.08));
    for (const sx of [-1, 1]) {
      cf.push(G.part(G.box(0.05, 0.05, 1.62), 0x1a1c1f, sx * 0.835, 0.2, -0.03));
      cf.push(G.beam(V(sx * 0.85, 0.82, -0.55), V(sx * 0.93, 0.875, -0.6), 0.024, 0x15171a));
    }
    cf.push(G.part(G.box(1.24, 0.02, 0.5), 0x121315, 0, 0.165, 1.93));
    for (const x of [-0.66, -0.2, 0.2, 0.66]) cf.push(G.part(G.taperBox(0.02, 0.11, 0.48, 0.02, 0.3, 0.09), 0x1c1e21, x, 0.215, 1.95));
    cf.push(...seal);
    body.add(new T.Mesh(G.merge(cf), carbon));
    // aero mirrors: a smooth pod on each stalk
    for (const sx of [-1, 1]) {
      const cap = new T.Mesh(new T.SphereGeometry(1, 16, 10), paint);
      cap.scale.set(0.05, 0.036, 0.115);
      cap.position.set(sx * 0.95, 0.885, -0.62);
      cap.rotation.y = sx * 0.12;
      body.add(cap);
      const mirrorGlass = new T.Mesh(new T.CircleGeometry(1, 16), glass);
      mirrorGlass.scale.set(0.06, 0.04, 1);
      mirrorGlass.scale.set(0.042, 0.028, 1);
      mirrorGlass.position.set(sx * 0.95, 0.885, -0.506);
      body.add(mirrorGlass);
    }

    // ---- lights and trim, stuck flush onto the sculpted surface by ray-casting
    bodyMesh.updateMatrixWorld(true);
    const ray = new T.Raycaster();
    const hitBody = (origin, dir) => {
      ray.set(origin, dir.clone().normalize());
      return ray.intersectObject(bodyMesh, false)[0] || null;
    };
    const stick = (geo, mat, origin, dir, alongV, lift = 0.006) => {
      const hit = hitBody(origin, dir);
      if (!hit) return null;
      const n = hit.face.normal.clone().normalize();
      const t = alongV.clone().sub(n.clone().multiplyScalar(n.dot(alongV))).normalize();
      const b = new T.Vector3().crossVectors(t, n).normalize();
      const m = new T.Mesh(geo, mat);
      m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(t, n, b));
      m.position.copy(hit.point).addScaledVector(n, lift);
      body.add(m);
      return m;
    };
    // a thin line drawn along the body through points given as [z, y] on one flank
    const panelLine = (sx, pts, width = 0.012) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [za, ya] = pts[i], [zb, yb] = pts[i + 1];
        const len = Math.hypot(zb - za, yb - ya);
        stick(new T.BoxGeometry(len + 0.006, 0.006, width), lensMat, V(sx * 3, (ya + yb) / 2, (za + zb) / 2), V(-sx, 0, 0), V(0, yb - ya, zb - za), 0.003);
      }
    };
    // Everything on the nose is laid on by rays fired straight back from in front of the car:
    // a point given as (x, y) lands wherever the bodywork is at that height.
    const onNose = (x, y) => {
      const hit = hitBody(V(x, y, -4), V(0, 0, 1));
      return hit ? { p: hit.point.clone(), n: hit.face.normal.clone().normalize() } : null;
    };
    // a ribbon w wide along a path of (x, y) points on the nose
    const noseRibbon = (path, n, w, lift, mat) => {
      const hits = [];
      for (let i = 0; i < n; i++) { const h = onNose(...path(i / (n - 1))); if (h) hits.push(h); }
      const pos = [], idx = [];
      for (let i = 0; i < hits.length; i++) {
        const a = hits[Math.max(0, i - 1)], b = hits[Math.min(hits.length - 1, i + 1)];
        const t = b.p.clone().sub(a.p).normalize();
        // average the facet normals either side so the ribbon doesn't twist from face to face
        const nm = a.n.clone().add(hits[i].n).add(b.n).normalize();
        const across = new T.Vector3().crossVectors(nm, t).normalize().multiplyScalar(w / 2);
        const c = hits[i].p.clone().addScaledVector(nm, lift);
        for (const q of [c.clone().add(across), c.clone().sub(across)]) pos.push(q.x, q.y, q.z);
      }
      for (let i = 0; i < hits.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const m = new T.Mesh(g, mat);
      body.add(m);
      return m;
    };
    // a patch on the nose: shape(u, v) gives (x, y) for u along it and v across it (-1 to 1)
    const nosePatch = (shape, nu, nv, lift, mat) => {
      const pos = [], idx = [], id = [];
      for (let i = 0; i <= nu; i++) {
        for (let j = 0; j <= nv; j++) {
          const h = onNose(...shape(i / nu, -1 + (2 * j) / nv));
          if (h) { const q = h.p.addScaledVector(h.n, lift); id.push(pos.length / 3); pos.push(q.x, q.y, q.z); } else id.push(-1);
        }
      }
      const at = (i, j) => id[i * (nv + 1) + j];
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) idx.push(a, b, c, a, c, d);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new T.Mesh(g, mat);
      body.add(m);
      return m;
    };
    // Headlamps: a swept almond on the leading edge of each front fender, pointed at the inner
    // end, fullest near the corner and rounding off as it wraps onto the flank, the way the
    // Roadster prototype and the Rimac Nevera do it. Black-chrome housing, an LED blade along
    // the top edge that hooks down round the outer end, three projectors, amber below.
    const lampFill = (u) => Math.pow(u, 0.85) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 5)));
    const lamp = (sx, grow = 1) => (u, v) => [
      sx * EZ.lerp(0.34, 0.9, u),
      EZ.lerp(0.455, 0.575, Math.pow(u, 1.4)) + v * 0.072 * grow * lampFill(u),
    ];
    const housingMat = new T.MeshStandardMaterial({ color: 0x0a0b0d, metalness: 0.9, roughness: 0.12, envMap: env, envMapIntensity: 1.25, side: T.DoubleSide });
    const bezelMat = satin.clone();
    bezelMat.side = T.DoubleSide;
    const projMat = new T.MeshBasicMaterial({ color: 0xdce8ff });
    const chromeMat = new T.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.95, roughness: 0.18, envMap: env });
    const lensStrip = lensMat.clone();
    lensStrip.side = headMat.side = blinkMat.side = T.DoubleSide;
    const blinkers = { L: [], R: [] };
    const lampSpots = [];
    for (const sx of [-1, 1]) {
      nosePatch(lamp(sx, 1.28), 26, 4, 0.004, bezelMat);
      nosePatch(lamp(sx), 26, 6, 0.007, housingMat);
      const L = lamp(sx);
      noseRibbon((k) => (k < 0.8
        ? L(EZ.lerp(0.07, 0.93, k / 0.8), 0.68)
        : L(0.93 + 0.045 * Math.sin(((k - 0.8) / 0.2) * (PI / 2)), EZ.lerp(0.68, -0.55, (k - 0.8) / 0.2))), 34, 0.011, 0.011, headMat);
      for (const u of [0.5, 0.64, 0.78]) {
        const h = onNose(...L(u, -0.14));
        if (!h) continue;
        const q = new T.Quaternion().setFromUnitVectors(V(0, 0, 1), h.n);
        const lens = new T.Mesh(new T.CircleGeometry(0.019, 18), projMat);
        const ring = new T.Mesh(new T.RingGeometry(0.019, 0.027, 20), chromeMat);
        lens.position.copy(h.p).addScaledVector(h.n, 0.0115);
        ring.position.copy(h.p).addScaledVector(h.n, 0.011);
        lens.quaternion.copy(q);
        ring.quaternion.copy(q);
        body.add(lens, ring);
        if (u === 0.64) lampSpots.push(h.p.clone());
      }
      const bf = noseRibbon((k) => L(EZ.lerp(0.6, 0.92, k), -0.72), 12, 0.009, 0.011, blinkMat);
      const br = stick(new T.BoxGeometry(0.12, 0.012, 0.035), blinkMat, V(sx * 0.7, 0.66, 4), V(0, 0, -1), V(sx, 0, -0.25), 0.012);
      (sx < 0 ? blinkers.L : blinkers.R).push(...[bf, br].filter(Boolean));
      // louvres in the scoop that feeds the fans, and the door shut lines
      for (const y of [0.42, 0.47, 0.52]) stick(new T.BoxGeometry(0.3, 0.006, 0.016), lensMat, V(sx * 3, y, 0.6), V(-sx, 0, 0), V(0, 0.12, 1), 0.003);
      panelLine(sx, [[-0.7, 0.34], [-0.72, 0.5], [-0.69, 0.66], [-0.6, 0.76]]);
      panelLine(sx, [[0.22, 0.34], [0.2, 0.52], [0.16, 0.74]]);
      panelLine(sx, [[-0.7, 0.34], [-0.25, 0.33], [0.22, 0.34]]);
    }
    // the wide, dark smile of the lower intake
    nosePatch((u, v) => {
      const e = 2 * u - 1;
      return [0.6 * e, 0.37 + 0.045 * e * e + v * 0.026 * (1 - 0.4 * e * e) * Math.sqrt(Math.max(0, 1 - Math.pow(e, 10)))];
    }, 64, 4, 0.008, lensStrip);
    // full-width rear light bar, built from short segments that follow the curved tail
    for (let i = 0; i < 13; i++) {
      const x = -0.72 + i * 0.12;
      stick(new T.BoxGeometry(0.14, 0.01, 0.06), lensMat, V(x, 0.735, 4), V(0, 0, -1), V(1, 0, 0), 0.004);
      stick(new T.BoxGeometry(0.13, 0.012, 0.022), tailMat, V(x, 0.735, 4), V(0, 0, -1), V(1, 0, 0), 0.01);
    }
    let rearZ = 2.2;
    { const hit = hitBody(V(0, 0.5, 4), V(0, 0, -1)); if (hit) rearZ = hit.point.z; }

    // ---- active rear wing: an airfoil on two struts, up for grip, flat for top speed
    let deckY = 0.93;
    { const hit = hitBody(V(0, 3, 1.82), V(0, -1, 0)); if (hit) deckY = hit.point.y; }
    const wing = new T.Group();
    wing.position.set(0, deckY, 1.82);
    body.add(wing);
    const foil = new T.Shape();
    foil.moveTo(0.17, 0.0);
    foil.quadraticCurveTo(0.17, 0.028, 0.1, 0.034);
    foil.quadraticCurveTo(-0.05, 0.03, -0.17, 0.012);
    foil.lineTo(-0.175, 0.03);
    foil.lineTo(-0.18, 0.0);
    foil.quadraticCurveTo(0.0, -0.008, 0.17, 0.0);
    const bladeGeo = new T.ExtrudeGeometry(foil, { depth: 1.5, bevelEnabled: false, curveSegments: 8 });
    bladeGeo.translate(0, 0, -0.75);
    bladeGeo.rotateY(PI / 2);
    const blade = new T.Mesh(bladeGeo, paint);
    for (const sx of [-1, 1]) {
      const plate = new T.Mesh(G.taperBox(0.012, 0.08, 0.3, 0.012, 0.2, 0.03), paint);
      plate.position.set(sx * 0.756, 0.02, 0);
      blade.add(plate);
    }
    wing.add(blade);
    const struts = [];
    for (const sx of [-1, 1]) {
      const st = new T.Mesh(new T.BoxGeometry(0.02, 1, 0.075), satin);
      st.position.set(sx * 0.42, 0, 0.03);
      wing.add(st);
      struts.push(st);
    }

    // ---- suction fans: two ducted fans in nacelles under the tail, behind the diffuser
    const fans = [];
    const fanMat = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.35, envMap: env, envMapIntensity: 0.8 });
    const duct = new T.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.2, roughness: 0.7, side: T.DoubleSide });
    const fanR = 0.13, fanY = 0.41, fanX = 0.43;
    const lipMat = new T.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.95, roughness: 0.2, envMap: env });
    const tone = (geo, v) => { geo.setAttribute('color', new T.Float32BufferAttribute(new Array(geo.attributes.position.count * 3).fill(v), 3)); return geo; };
    for (const sx of [-1, 1]) {
      let fanZ = 2.18;
      { const hit = hitBody(V(sx * fanX, fanY, 4), V(0, 0, -1)); if (hit) fanZ = hit.point.z; }
      const g = new T.Group();
      g.position.set(sx * fanX, fanY, fanZ);
      // the nacelle: a carbon cowl standing just proud of the fascia, a machined lip, a deep duct
      const cowl = new T.Mesh(tone(new T.CylinderGeometry(fanR + 0.035, fanR + 0.045, 0.28, 32, 1, true).rotateX(PI / 2), 0.1), carbon);
      cowl.position.z = -0.07;
      g.add(cowl);
      const face = new T.Mesh(tone(new T.RingGeometry(fanR + 0.012, fanR + 0.036, 32), 0.12), carbon);
      face.position.z = 0.07;
      g.add(face);
      const inner = new T.Mesh(new T.CylinderGeometry(fanR, fanR, 0.07, 32, 1, true).rotateX(PI / 2), duct);
      inner.position.z = 0.035;
      g.add(inner);
      const lip = new T.Mesh(new T.TorusGeometry(fanR + 0.006, 0.01, 8, 36), lipMat);
      lip.position.z = 0.07;
      g.add(lip);
      const back = new T.Mesh(new T.CircleGeometry(fanR, 28), barrelMat);
      back.position.z = 0.006;
      g.add(back);
      // glow ring at the back of the duct, brighter the harder the fans pull
      const glowRing = new T.Mesh(new T.TorusGeometry(fanR - 0.012, 0.009, 6, 36), fanGlowMat);
      glowRing.position.z = 0.012;
      g.add(glowRing);
      // stator vanes behind the rotor
      const stator = [];
      for (let i = 0; i < 4; i++) stator.push(G.part(G.box(0.01, fanR * 1.9, 0.012), 0x2a2d31, 0, 0, 0.018, 0, 0, (i / 4) * PI));
      g.add(new T.Mesh(G.merge(stator), fanMat));
      // the rotor: eleven twisted blades and a spinner, turned by the player each frame
      const rotor = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * PI * 2;
        rotor.push(G.part(G.box(0.05, fanR * 0.78, 0.008), i % 2 ? 0x9aa2aa : 0x7f878f, Math.cos(a + PI / 2) * fanR * 0.5, Math.sin(a + PI / 2) * fanR * 0.5, 0, 0, 0.6, a));
      }
      rotor.push(G.part(new T.ConeGeometry(0.042, 0.06, 16).rotateX(PI / 2), 0xc9ced3, 0, 0, 0.022));
      rotor.push(G.part(G.cyl(0.05, 0.05, 0.03, 16), 0x3a3f45, 0, 0, 0, PI / 2, 0, 0));
      const blades = new T.Mesh(G.merge(rotor), fanMat);
      blades.position.z = 0.032;
      g.add(blades);
      body.add(g);
      fans.push(blades);
    }

    // ---- ten cold-gas thrusters around the car: [position, push direction of the gas]
    const thrusters = [];
    const nozzleRim = new T.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.9, roughness: 0.3, envMap: env });
    const nozzle = (pos, dir) => {
      const q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
      const m = new T.Mesh(new T.CylinderGeometry(0.024, 0.03, 0.03, 12), nozzleRim);
      m.position.copy(pos);
      m.quaternion.copy(q);
      body.add(m);
      const core = new T.Mesh(new T.CircleGeometry(0.018, 12).rotateX(-PI / 2).translate(0, 0.016, 0), nozzleMat);
      core.position.copy(pos);
      core.quaternion.copy(q);
      body.add(core);
      thrusters.push({ pos: pos.clone(), dir: dir.clone().normalize() });
    };
    for (const sx of [-1, 1]) {
      nozzle(V(sx * 0.62, 0.28, -2.12), V(sx * 0.3, -0.2, -1));
      nozzle(V(sx * 0.84, 0.235, -0.85), V(sx, -0.3, 0));
      nozzle(V(sx * 0.85, 0.235, 0.32), V(sx, -0.3, 0));
      nozzle(V(sx * 0.45, 0.15, 0.4), V(0, -1, 0));
    }

    // night glow
    const glowMats = { head: Models.mats().additive(0xf4f7ff, 0), tail: Models.mats().additive(0xff2038, 0) };
    const tailGlow = new T.Mesh(new T.PlaneGeometry(2.0, 0.5), glowMats.tail);
    tailGlow.position.set(0, 0.73, rearZ + 0.1);
    body.add(tailGlow);
    for (const spot of lampSpots) {
      const hg = new T.Mesh(new T.PlaneGeometry(0.75, 0.38), glowMats.head);
      hg.position.set(spot.x, spot.y, spot.z - 0.12);
      hg.rotation.y = PI;
      body.add(hg);
    }
    // headlight beams on the road (only matter after dusk)
    const beamMat = Models.mats().additive(0xfff1d6, 0);
    const beam = new T.Mesh(new T.PlaneGeometry(5.5, 22), beamMat);
    beam.rotation.x = -PI / 2;
    beam.position.set(0, 0.05, -13.5);
    root.add(beam);

    // ---- licence plate hinge with cold-gas nozzles behind it
    const plateHinge = new T.Group();
    plateHinge.position.set(0, 0.6, rearZ + 0.014);
    const plate = new T.Mesh(new T.PlaneGeometry(0.42, 0.13), plateMat);
    plate.position.set(0, -0.068, 0.01);
    plateHinge.add(plate);
    body.add(plateHinge);
    for (const sx of [-1, 1]) {
      const nz = new T.Mesh(new T.CylinderGeometry(0.035, 0.045, 0.06, 12, 1), nozzleMat);
      nz.rotation.x = PI / 2;
      nz.position.set(sx * 0.1, 0.53, rearZ - 0.02);
      body.add(nz);
      thrusters.push({ pos: V(sx * 0.1, 0.53, rearZ + 0.02), dir: V(0, 0, 1), rear: true });
    }

    // ---- wheels: steering pivot > spinning hub
    const wheels = [];
    const mkWheel = (x, y, z, r, w, front) => {
      const side = Math.sign(x);
      const pivot = new T.Group();
      pivot.position.set(x, y, z);
      const spin = new T.Group();
      pivot.add(spin);
      spin.add(new T.Mesh(tyreGeo(r, w), tireMat));
      spin.add(new T.Mesh(rimGeo(r, w, side), rimMat));
      const disc = new T.Mesh(discGeo(r), rimMat);
      disc.position.x = side * (w / 2 - 0.12);
      spin.add(disc);
      const barrel = new T.Mesh(new T.CylinderGeometry(r * 0.7, r * 0.7, w - 0.08, 24, 1, true).rotateZ(PI / 2), new T.MeshBasicMaterial({ color: 0x0d0e0f, side: T.BackSide }));
      pivot.add(barrel);
      const hubBack = new T.Mesh(new T.CircleGeometry(r * 0.7, 24), barrelMat);
      hubBack.rotation.y = side * PI / 2;
      hubBack.position.x = side * (w / 2 - 0.17);
      pivot.add(hubBack);
      const cal = new T.Mesh(G.taperBox(0.07, 0.17, 0.2, 0.06, 0.15), caliperMat);
      cal.position.set(side * (w / 2 - 0.1), r * 0.36, front ? r * 0.22 : -r * 0.22);
      cal.rotation.x = front ? 0.6 : -0.6;
      pivot.add(cal);
      chassis.add(pivot);
      const wh = { pivot, spin, front, baseY: y, r };
      wheels.push(wh);
      return wh;
    };
    mkWheel(-0.84, 0.34, AXLE_F, 0.34, 0.27, true);
    mkWheel(0.84, 0.34, AXLE_F, 0.34, 0.27, true);
    mkWheel(-0.86, 0.355, AXLE_R, 0.355, 0.33, false);
    mkWheel(0.86, 0.355, AXLE_R, 0.355, 0.33, false);

    const paints = [paint, frameMat];
    return {
      root, rig, chassis, body, wheels, plateHinge, blinkers, mats, glowMats, beamMat, tailGlow,
      wing, blade, struts, deckY, fans, thrusters,
      setPaint(p) {
        for (const m of paints) {
          m.color.set(p.color);
          m.metalness = p.metal;
          m.roughness = p.rough;
          m.clearcoat = p.rough > 0.6 ? 0.15 : 1;
        }
      },
      setEnv(tex) {
        root.traverse((o) => {
          const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          for (const m of list) {
            if (m.isMeshStandardMaterial && m.envMap !== tex) { m.envMap = tex; m.needsUpdate = true; }
          }
        });
      },
    };
  };

  // ================================================================ traffic (instanced)
  // Every car is a sculpted side profile (with real wheel arches) extruded across its width,
  // a glass cabin whose roof and pillars are painted, and lamps, grilles and trim ray-cast flush
  // onto the bodywork. Profiles use x = forward (the nose is at +x, which is -z in car space).
  const shadowPart = (W, L) => ({ geo: new T.PlaneGeometry(W + 0.8, L + 1.1).rotateX(-PI / 2).translate(0, 0.03, 0), mat: Models.mats().shadow });
  const V3 = (x, y, z) => new T.Vector3(x, y, z);

  function shapeOf(cmds, arches) {
    const s = new T.Shape();
    for (const c of cmds) {
      if (c[0] === 'm') s.moveTo(c[1], c[2]);
      else if (c[0] === 'l') s.lineTo(c[1], c[2]);
      else s.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    }
    // the bottom edge runs from the tail back to the nose, notched for each wheel
    for (const [cx, cy, r, y0] of arches || []) {
      const a = Math.asin(EZ.clamp((cy - y0) / r, -0.99, 0.99));
      s.lineTo(cx - r * Math.cos(a), y0);
      s.absarc(cx, cy, r, PI + a, -a, true);
    }
    return s;
  }
  const scaleCmds = (cmds, k) => cmds.map((c) => (c[0] === 'q' ? ['q', c[1] * k, c[2], c[3] * k, c[4]] : [c[0], c[1] * k, c[2]]));
  function extrudeSide(shape, width, o = {}) {
    const bt = o.bt == null ? 0.1 : o.bt, bs = o.bs == null ? 0.05 : o.bs;
    const depth = width - 2 * bt;
    const g = new T.ExtrudeGeometry(shape, { depth, steps: o.steps || 6, curveSegments: o.seg || 10, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 3 });
    g.translate(0, 0, -depth / 2);
    g.rotateY(PI / 2);
    // how far across the car each vertex started, -1 (left) to 1 (right)
    const p = g.attributes.position, u = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) u[i] = p.getX(i) / (width / 2);
    g.userData.u = u;
    return g;
  }
  // Split a cabin into painted roof and pillars versus glass. The side walls of an extrusion are
  // quads (two triangles each); classify them as whole quads so window edges come out straight.
  function splitCabin(g) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.userData.u;
    const out = { paint: [[], []], glass: [[], []] };
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), fn = new T.Vector3();
    const faceNormal = (i) => {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      return c.sub(b).cross(a.sub(b)).normalize();
    };
    const take = (start, count) => {
      fn.set(0, 0, 0);
      let edge = 0;
      for (let i = start; i < start + count; i += 3) fn.add(faceNormal(i));
      fn.normalize();
      for (let i = start; i < start + count; i++) edge += Math.abs(u[i]);
      edge /= count;
      const painted = fn.y > 0.9 || (edge > 0.8 && Math.abs(fn.x) < 0.75);
      const dst = painted ? out.paint : out.glass;
      for (let k = start; k < start + count; k++) {
        dst[0].push(p.getX(k), p.getY(k), p.getZ(k));
        dst[1].push(n.getX(k), n.getY(k), n.getZ(k));
      }
    };
    const groups = g.groups.length ? g.groups : [{ start: 0, count: p.count, materialIndex: 0 }];
    for (const grp of groups) {
      const step = grp.materialIndex === 1 ? 6 : 3;
      for (let i = grp.start; i + step <= grp.start + grp.count; i += step) take(i, step);
    }
    const mk = ([pos, nor]) => {
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      gg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      return gg;
    };
    return { paint: mk(out.paint), glass: mk(out.glass) };
  }
  // Returns a function that drops a flat part onto the first surface a ray meets.
  function sticker(geo) {
    const mesh = new T.Mesh(geo);
    mesh.updateMatrixWorld(true);
    const ray = new T.Raycaster();
    const fn = (part, color, origin, dir, along, lift = 0.008) => {
      ray.set(origin, dir.clone().normalize());
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit) return null;
      const n = hit.face.normal.clone().normalize();
      const t = along.clone().sub(n.clone().multiplyScalar(n.dot(along))).normalize();
      const bb = new T.Vector3().crossVectors(t, n).normalize();
      const m = new T.Matrix4().makeBasis(t, n, bb);
      m.setPosition(hit.point.clone().addScaledVector(n, lift));
      return { g: part, c: color, m };
    };
    fn.hit = (origin, dir) => {
      ray.set(origin, dir.clone().normalize());
      const h = ray.intersectObject(mesh, false)[0];
      return h ? h.point.clone() : null;
    };
    return fn;
  }
  const push = (list, part) => { if (part) list.push(part); };

  // tyre, five-spoke alloy, hub
  function wheelSet(list, xs, zs, r, w, rim = 0x9aa0a6) {
    for (const x of xs) {
      const side = Math.sign(x);
      for (const z of zs) {
        list.push(G.part(G.cyl(r, r, w, 16), 0x141517, x, r, z, 0, 0, PI / 2));
        list.push(G.part(G.cyl(r * 0.66, r * 0.66, 0.02, 14), 0x23262a, x + side * (w / 2 + 0.002), r, z, 0, 0, PI / 2));
        for (let i = 0; i < 5; i++) list.push(G.part(G.box(0.03, r * 1.16, 0.075), rim, x + side * (w / 2 + 0.014), r, z, (i / 5) * PI, 0, 0));
        list.push(G.part(G.cyl(r * 0.2, r * 0.2, 0.04, 10), rim, x + side * (w / 2 + 0.024), r, z, 0, 0, PI / 2));
      }
    }
  }

  function buildCar(s) {
    const m = Models.mats();
    const L = s.L, W = s.W;
    const plan = (z) => interp(s.planZ, s.planW, z);
    const bodyGeo = extrudeSide(shapeOf(s.body, s.arches), W, { steps: 6 });
    const warpBody = (g) => G.warp(g, (v) => {
      let k = plan(v.z);
      if (v.y > s.tumbleY) k *= 1 - (v.y - s.tumbleY) * (s.tumbleK || 0.3);
      v.x *= k;
    });
    warpBody(bodyGeo);
    // where the flat side of the body sits at a given height and position along the car
    const sideAt = (y, z) => (W / 2) * plan(z) * (y > s.tumbleY ? 1 - (y - s.tumbleY) * (s.tumbleK || 0.3) : 1);
    G.creased(bodyGeo, 0.7);
    const fixed = s.fixedPaint != null;
    const paint = [], trim = [], lights = [];
    (fixed ? trim : paint).push({ g: bodyGeo, c: fixed ? s.fixedPaint : 0xffffff });
    const body = sticker(bodyGeo);
    let cab = null;
    if (s.cabin) {
      const cg = extrudeSide(shapeOf(s.cabin), W * (s.cabinW || 0.8), { steps: 6, bt: 0.08, bs: 0.04 });
      G.warp(cg, (v) => { v.x *= plan(v.z) * (1 - EZ.clamp(v.y - s.belt, 0, 1) * (s.cabinK || 0.5)); });
      G.creased(cg, 0.8);
      const split = splitCabin(cg);
      (fixed ? trim : paint).push({ g: split.paint, c: fixed ? s.roofColor || s.fixedPaint : 0xffffff });
      trim.push({ g: split.glass, c: s.glass || 0x1d2933 });
      cab = sticker(cg);
      for (const z of s.pillars || []) {
        for (const sx of [-1, 1]) {
          const a = cab.hit(V3(sx * 4, s.belt + 0.06, z), V3(-sx, 0, 0));
          const b = cab.hit(V3(sx * 4, s.roofY - 0.1, z), V3(-sx, 0, 0));
          if (a && b) (fixed ? trim : paint).push(G.beam(a.add(V3(sx * 0.012, 0, 0)), b.add(V3(sx * 0.012, 0, 0)), 0.08, fixed ? s.fixedPaint : 0xffffff));
        }
      }
    }
    const far = s.rayFar || L + 2;
    const front = -far, rear = far;
    // lamps
    if (s.head) {
      const [hx, hy, hw, hh] = s.head;
      for (const sx of [-1, 1]) {
        push(trim, body(G.box(hw + 0.05, 0.01, hh + 0.04), 0x101214, V3(sx * hx, hy, front), V3(0, 0, 1), V3(sx, 0, 0.3), 0.004));
        push(lights, body(G.box(hw, 0.012, hh), 0xf3f6ff, V3(sx * hx, hy, front), V3(0, 0, 1), V3(sx, 0, 0.3), 0.012));
        push(lights, body(G.box(0.08, 0.012, hh * 0.7), 0xffa630, V3(sx * (hx + hw / 2 + 0.06), hy, front), V3(0, 0, 1), V3(sx, 0, 0.6), 0.012));
      }
    }
    if (s.tail) {
      const [tx, ty, tw, th] = s.tail;
      for (const sx of [-1, 1]) {
        push(trim, body(G.box(tw + 0.04, 0.01, th + 0.04), 0x2a0a0d, V3(sx * tx, ty, rear), V3(0, 0, -1), V3(sx, 0, -0.2), 0.004));
        push(lights, body(G.box(tw, 0.012, th), 0xff2a2a, V3(sx * tx, ty, rear), V3(0, 0, -1), V3(sx, 0, -0.2), 0.012));
      }
    }
    if (s.grille) {
      const [gw, gh, gy, gc] = s.grille;
      push(trim, body(G.box(gw, 0.014, gh), gc || 0x15171a, V3(0, gy, front), V3(0, 0, 1), V3(1, 0, 0), 0.006));
      for (let i = 0; i < 3; i++) push(trim, body(G.box(gw * 0.92, 0.018, 0.018), s.grilleBars || 0x5a6068, V3(0, gy - gh * 0.3 + i * gh * 0.3, front), V3(0, 0, 1), V3(1, 0, 0), 0.012));
    }
    if (s.plateY) {
      push(trim, body(G.box(0.38, 0.01, 0.14), 0x1b1d20, V3(0, s.plateY, rear), V3(0, 0, -1), V3(1, 0, 0), 0.006));
      push(trim, body(G.box(0.34, 0.012, 0.1), 0xeceee8, V3(0, s.plateY, rear), V3(0, 0, -1), V3(1, 0, 0), 0.012));
    }
    if (s.bumperY) {
      for (const [z, d] of [[front, 1], [rear, -1]]) {
        for (let i = -2; i <= 2; i++) push(trim, body(G.box(0.4, 0.05, 0.16), s.bumper || 0x2a2c30, V3(i * 0.36 * (W / 1.85), s.bumperY, z), V3(0, 0, d), V3(1, 0, 0), 0.01));
      }
    }
    // mirrors and door handles
    if (s.mirrorZ != null) {
      for (const sx of [-1, 1]) {
        const p = body.hit(V3(sx * 4, s.belt - 0.04, s.mirrorZ), V3(-sx, 0, 0));
        if (p) {
          (fixed ? trim : paint).push(G.part(G.taperBox(0.07, 0.12, 0.2, 0.05, 0.16), fixed ? s.fixedPaint : 0xffffff, p.x + sx * 0.05, s.belt + 0.08, s.mirrorZ, 0, 0, sx * 0.1));
          trim.push(G.part(G.box(0.03, 0.09, 0.16), 0x23262a, p.x + sx * 0.12, s.belt + 0.1, s.mirrorZ + 0.02));
        }
        for (const z of s.handles || []) push(trim, body(G.box(0.14, 0.012, 0.035), 0x2a2c30, V3(sx * 4, s.belt - 0.12, z), V3(-sx, 0, 0), V3(0, 0, 1), 0.01));
      }
    }
    const wx = W / 2 - 0.04 - (s.tireW || 0.24) / 2;
    wheelSet(trim, [-wx, wx], s.axles.map((x) => -x), s.wheelR, s.tireW || 0.24, s.rim);
    if (s.extra) s.extra({ paint, trim, lights, body, cab, fixed, warpBody, sideAt });
    return {
      parts: [
        ...(paint.length ? [{ geo: G.merge(paint), mat: m.paint, tint: true }] : []),
        { geo: G.merge(trim), mat: m.vc },
        { geo: G.merge(lights), mat: m.lights },
        ...(s.parts || []),
        shadowPart(W, L),
      ],
      hw: W / 2, hl: L / 2, h: s.roofY + 0.05,
    };
  }

  const SEDAN = {
    L: 4.7, W: 1.84, wheelR: 0.33, axles: [1.42, -1.42],
    body: [['m', 2.28, 0.26], ['l', 2.36, 0.4], ['q', 2.4, 0.62, 2.22, 0.7], ['q', 1.55, 0.78, 0.92, 0.84], ['l', -1.15, 0.88], ['q', -1.95, 0.9, -2.27, 0.84], ['q', -2.38, 0.64, -2.33, 0.42], ['l', -2.24, 0.26]],
    arches: [[-1.42, 0.33, 0.4, 0.26], [1.42, 0.33, 0.4, 0.26]],
    planZ: [-2.4, -1.9, -1.42, 0, 1.42, 1.95, 2.4], planW: [0.82, 0.96, 1, 0.985, 1, 0.97, 0.86],
    tumbleY: 0.6,
    cabin: [['m', 1.0, 0.8], ['q', 0.62, 1.02, 0.3, 1.3], ['q', -0.2, 1.38, -0.78, 1.34], ['q', -1.22, 1.18, -1.52, 0.86], ['l', -1.52, 0.78], ['l', 1.0, 0.78]],
    cabinW: 0.8, belt: 0.86, roofY: 1.38, pillars: [0.12],
    head: [0.6, 0.6, 0.38, 0.11], tail: [0.62, 0.72, 0.38, 0.11], grille: [0.78, 0.15, 0.47], plateY: 0.52, bumperY: 0.33,
    mirrorZ: -0.78, handles: [-0.2, 0.6],
  };

  function cruiser() {
    const m = Models.mats();
    const k = 5.0 / 4.7;
    const roofY = 1.38;
    const lightbarY = roofY + 0.06;
    const red = new T.BoxGeometry(0.56, 0.1, 0.25).translate(-0.31, lightbarY + 0.1, 0.2);
    const blue = new T.BoxGeometry(0.56, 0.1, 0.25).translate(0.31, lightbarY + 0.1, 0.2);
    const crossed = (x) => G.merge([
      { g: new T.PlaneGeometry(1.7, 0.9).translate(x, lightbarY + 0.12, 0.2), c: 0xffffff },
      { g: new T.PlaneGeometry(1.7, 0.9).rotateY(PI / 2).translate(x, lightbarY + 0.12, 0.2), c: 0xffffff },
      { g: new T.PlaneGeometry(1.4, 1.4).rotateX(-PI / 2).translate(x, lightbarY + 0.14, 0.2), c: 0xffffff },
    ]);
    return buildCar(Object.assign({}, SEDAN, {
      L: 5.0, W: 1.92, wheelR: 0.34, axles: [1.52, -1.52], rim: 0x3a3d42,
      body: scaleCmds(SEDAN.body, k), cabin: scaleCmds(SEDAN.cabin, k),
      arches: [[-1.52, 0.34, 0.41, 0.26], [1.52, 0.34, 0.41, 0.26]],
      planZ: SEDAN.planZ.map((z) => z * k),
      fixedPaint: 0x15171a, roofColor: 0xf1f1ec, mirrorZ: -0.84, handles: [-0.2, 0.65],
      parts: [
        { geo: red, mat: m.copRed },
        { geo: blue, mat: m.copBlue },
        { geo: crossed(-0.45), mat: m.copGlowRed },
        { geo: crossed(0.45), mat: m.copGlowBlue },
      ],
      extra({ trim, body, sideAt }) {
        // white doors: a fine grid laid exactly on the body's side surface, a hair proud of it
        const nz = 16, ny = 5, z0 = -1.08, z1 = 1.12, y0 = 0.42, y1 = 0.82;
        for (const sx of [-1, 1]) {
          const pos = [];
          const pt = (z, y) => [sx * (sideAt(y, z) + 0.022), y, z];
          for (let i = 0; i < nz; i++) {
            for (let j = 0; j < ny; j++) {
              const za = z0 + ((z1 - z0) * i) / nz, zb = z0 + ((z1 - z0) * (i + 1)) / nz;
              const ya = y0 + ((y1 - y0) * j) / ny, yb = y0 + ((y1 - y0) * (j + 1)) / ny;
              const a = pt(za, ya), b = pt(zb, ya), c = pt(zb, yb), d = pt(za, yb);
              const tris = sx > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
              for (const v of tris) pos.push(v[0], v[1], v[2]);
            }
          }
          const g = new T.BufferGeometry();
          g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
          g.computeVertexNormals();
          trim.push({ g, c: 0xf1f1ec });
        }
        for (const sx of [-1, 1]) {
          push(trim, body(G.box(0.17, 0.01, 0.17), 0xd6a520, V3(sx * 4, 0.66, -0.55), V3(-sx, 0, 0), V3(0, 0, 1), 0.03));
          trim.push(G.part(G.cyl(0.05, 0.06, 0.12, 8), 0xc9ced3, sx * 0.72, 1.02, -0.82, PI / 2, 0, 0));
        }
        trim.push(G.part(G.box(1.3, 0.07, 0.32), 0x202225, 0, lightbarY + 0.02, 0.2));
        trim.push(G.part(G.box(1.5, 0.12, 0.1), 0x111214, 0, 0.56, -2.62));
        trim.push(G.part(G.box(1.5, 0.12, 0.1), 0x111214, 0, 0.3, -2.62));
        for (const x of [-0.5, 0.5]) trim.push(G.part(G.box(0.1, 0.5, 0.1), 0x111214, x, 0.44, -2.62));
      },
    }));
  }

  // Box truck and semi: sculpted cabs, plain cargo boxes with the detail real ones carry.
  function boxTruck() {
    const L = 7.4, W = 2.36;
    return buildCar({
      L, W, wheelR: 0.47, tireW: 0.3, axles: [2.62, -2.2], rim: 0xb9bec4,
      body: [['m', 3.62, 0.45], ['l', 3.7, 0.62], ['q', 3.78, 1.35, 3.62, 1.62], ['q', 3.4, 2.3, 2.92, 2.46], ['l', 1.55, 2.46], ['l', 1.55, 0.45]],
      arches: [[2.62, 0.47, 0.55, 0.45]],
      planZ: [-3.75, -3.3, -1.5], planW: [0.9, 1, 1], tumbleY: 2.0, tumbleK: 0.1,
      roofY: 3.2, head: [0.78, 0.85, 0.34, 0.16], grille: [1.2, 0.32, 0.95, 0x2a2c30], bumperY: 0.55, bumper: 0x2a2c30,
      extra({ paint, trim, lights, body }) {
        push(trim, body(G.box(1.86, 0.012, 0.62), 0x1d2933, V3(0, 1.98, -9), V3(0, 0, 1), V3(1, 0, 0), 0.01));
        for (const sx of [-1, 1]) {
          push(trim, body(G.box(0.9, 0.012, 0.55), 0x1d2933, V3(sx * 4, 1.95, -2.75), V3(-sx, 0, 0), V3(0, 0, 1), 0.01));
          trim.push(G.part(G.box(0.05, 0.42, 0.18), 0x23262a, sx * 1.36, 1.95, -3.2));
          trim.push(G.part(G.box(0.2, 0.04, 0.04), 0x9aa0a6, sx * 1.26, 1.95, -3.2));
          trim.push(G.part(G.box(0.05, 0.3, 3.0), 0x2a2c30, sx * (W / 2 - 0.02), 0.58, 0.9));
          for (let i = 0; i < 8; i++) trim.push(G.part(G.box(0.02, 0.08, 0.3), i % 2 ? 0xf1f1ec : 0xc8102e, sx * (W / 2 + 0.005), 0.8, -1.2 + i * 0.62));
          for (let i = 0; i < 4; i++) lights.push(G.part(G.box(0.03, 0.06, 0.08), 0xffa630, sx * (W / 2 + 0.01), 3.18, -1.1 + i * 1.5));
          trim.push(G.part(G.cyl(0.24, 0.24, 0.9, 12), 0xb9bec4, sx * 0.95, 0.72, -0.9, PI / 2, 0, 0));
          lights.push(G.part(G.box(0.2, 0.32, 0.04), 0xff2a2a, sx * 1.0, 0.85, 3.67));
        }
        trim.push(G.part(G.box(W, 2.62, 5.1), 0xe9e8e3, 0, 0.62 + 1.31, 1.1));
        trim.push(G.part(G.box(W + 0.02, 0.3, 5.06), 0x1b4c8c, 0, 2.82, 1.1));
        trim.push(G.part(G.box(0.03, 2.4, 0.02), 0x8a8d90, 0, 1.92, 3.66));
        trim.push(G.part(G.box(W - 0.1, 0.03, 0.02), 0x8a8d90, 0, 3.12, 3.66));
        trim.push(G.part(G.box(W - 0.3, 0.3, 7.0), 0x222326, 0, 0.5, -0.1));
        trim.push(G.part(G.box(W - 0.1, 0.12, 0.12), 0x2a2c30, 0, 0.5, 3.7));
        trim.push(G.part(G.box(0.28, 0.4, 0.03), 0x111214, -0.95, 0.4, 2.85));
        trim.push(G.part(G.box(0.28, 0.4, 0.03), 0x111214, 0.95, 0.4, 2.85));
        wheelSet(trim, [-(W / 2 - 0.42), W / 2 - 0.42], [2.2], 0.47, 0.3, 0xb9bec4);
      },
    });
  }

  // The semi's tractor unit, nose at z = -9.2. Shift it with dz to reuse it elsewhere.
  function tractorSpec(W, L) {
    return {
      L, W, rayFar: 20, wheelR: 0.52, tireW: 0.4, axles: [8.0], rim: 0xc9ced3,
      body: [['m', 9.12, 0.62], ['l', 9.24, 0.82], ['q', 9.3, 1.55, 9.05, 1.7], ['l', 7.95, 1.84], ['q', 7.72, 2.85, 7.4, 3.0], ['l', 5.4, 3.0], ['l', 5.4, 0.62]],
      arches: [[8.0, 0.52, 0.6, 0.62]],
      planZ: [-9.3, -8.6, -7.6], planW: [0.88, 0.97, 1], tumbleY: 1.6, tumbleK: 0.08,
      roofY: 3.7, head: [0.85, 0.98, 0.36, 0.2], grille: [1.2, 0.75, 1.28, 0xb9bec4], bumperY: 0.66, bumper: 0xb9bec4,
    };
  }
  function tractorDetail(o, W) {
    const { paint, trim, lights, body } = o;
    push(trim, body(G.box(2.0, 0.012, 0.7), 0x1d2933, V3(0, 2.45, -14), V3(0, 0, 1), V3(1, 0, 0), 0.01));
    paint.push(G.part(G.taperBox(2.3, 0.7, 1.3, 2.2, 0.7, 0.28), 0xffffff, 0, 3.35, -6.15));
    for (const sx of [-1, 1]) {
      push(trim, body(G.box(0.8, 0.012, 0.55), 0x1d2933, V3(sx * 4, 2.4, -6.9), V3(-sx, 0, 0), V3(0, 0, 1), 0.01));
      trim.push(G.part(G.cyl(0.08, 0.08, 2.8, 10), 0xc9ced3, sx * 1.12, 2.6, -5.6));
      trim.push(G.part(G.cyl(0.32, 0.32, 1.2, 14), 0xc9ced3, sx * 1.05, 0.78, -6.7, PI / 2, 0, 0));
      trim.push(G.part(G.box(0.05, 0.5, 0.2), 0x23262a, sx * 1.42, 2.5, -7.55));
      trim.push(G.part(G.box(0.24, 0.04, 0.04), 0xc9ced3, sx * 1.3, 2.5, -7.55));
      for (const z of [-5.1, -3.9]) for (const dx of [0, 0.42]) {
        const x = sx * (W / 2 - 0.24 - dx);
        trim.push(G.part(G.cyl(0.52, 0.52, 0.36, 16), 0x141517, x, 0.52, z, 0, 0, PI / 2));
        trim.push(G.part(G.cyl(0.3, 0.3, 0.38, 12), 0xc9ced3, x, 0.52, z, 0, 0, PI / 2));
      }
    }
    trim.push(G.part(G.box(1.2, 0.25, 6.0), 0x1c1d20, 0, 0.78, -4.9));
    trim.push(G.part(G.box(1.6, 0.12, 1.4), 0x2a2c30, 0, 1.16, -4.4));
  }

  function semi() {
    const L = 16.6, W = 2.5;
    const spec = tractorSpec(W, L);
    return Object.assign(buildCar(Object.assign(spec, {
      extra(o) {
        tractorDetail(o, W);
        const { trim, lights } = o;
        trim.push(G.part(G.box(W, 2.75, 13.0), 0xdfe0dc, 0, 1.2 + 1.375, 1.7));
        for (const sx of [-1, 1]) {
          for (let i = 0; i < 18; i++) trim.push(G.part(G.box(0.02, 0.09, 0.36), i % 2 ? 0xf1f1ec : 0xc8102e, sx * (W / 2 + 0.006), 1.36, -4.55 + i * 0.72));
          trim.push(G.part(G.box(0.04, 0.55, 6.0), 0xb9bec4, sx * (W / 2 - 0.05), 0.92, 0.4));
          for (let i = 0; i < 6; i++) lights.push(G.part(G.box(0.03, 0.06, 0.08), 0xffa630, sx * (W / 2 + 0.01), 3.92, -4.2 + i * 2.4));
          trim.push(G.part(G.box(0.1, 0.9, 0.1), 0x8a8d90, sx * 0.9, 0.7, -3.4));
          lights.push(G.part(G.box(0.22, 0.22, 0.04), 0xff2a2a, sx * 1.05, 1.32, 8.23));
          for (const z of [5.9, 7.2]) for (const dx of [0, 0.42]) {
            const x = sx * (W / 2 - 0.24 - dx);
            trim.push(G.part(G.cyl(0.52, 0.52, 0.36, 16), 0x141517, x, 0.52, z, 0, 0, PI / 2));
            trim.push(G.part(G.cyl(0.3, 0.3, 0.38, 12), 0xb9bec4, x, 0.52, z, 0, 0, PI / 2));
          }
          trim.push(G.part(G.box(0.36, 0.45, 0.03), 0x111214, sx * 0.95, 0.42, 7.9));
        }
        trim.push(G.part(G.box(0.03, 2.5, 0.02), 0x8a8d90, 0, 2.55, 8.21));
        trim.push(G.part(G.box(W - 0.1, 0.12, 0.14), 0x2a2c30, 0, 0.55, 8.15));
        lights.push(G.part(G.box(2.3, 0.05, 0.05), 0xffa630, 0, 3.98, 8.2));
      },
    })), { hw: W / 2, hl: L / 2, h: 4.0 });
  }

  function pickup() {
    const W = 2.0;
    return buildCar({
      L: 5.5, W, wheelR: 0.4, tireW: 0.28, axles: [1.75, -1.85], rim: 0xc9ced3,
      body: [['m', 2.68, 0.4], ['l', 2.75, 0.58], ['q', 2.8, 0.98, 2.6, 1.06], ['q', 2.0, 1.12, 1.25, 1.15], ['l', -2.72, 1.15], ['q', -2.78, 1.14, -2.78, 0.95], ['l', -2.76, 0.52], ['l', -2.66, 0.4]],
      arches: [[-1.85, 0.4, 0.47, 0.4], [1.75, 0.4, 0.47, 0.4]],
      planZ: [-2.8, -2.3, -1.75, 0, 1.85, 2.8], planW: [0.88, 0.98, 1, 1, 1, 1], tumbleY: 0.9, tumbleK: 0.15,
      cabin: [['m', 1.32, 1.1], ['q', 0.98, 1.42, 0.8, 1.76], ['q', 0.15, 1.84, -0.58, 1.8], ['l', -0.64, 1.1], ['l', 1.32, 1.1]],
      cabinW: 0.86, belt: 1.12, roofY: 1.84, pillars: [0.02],
      head: [0.66, 0.84, 0.42, 0.15], tail: [0.86, 0.86, 0.12, 0.32], grille: [1.15, 0.32, 0.78, 0x1b1d20], grilleBars: 0xc9ced3, plateY: 0.62, bumperY: 0.5, bumper: 0x9aa0a6,
      mirrorZ: -1.05, handles: [-0.5],
      extra({ paint, trim }) {
        trim.push(G.part(G.box(W - 0.34, 0.04, 1.92), 0x1c1d20, 0, 1.17, 1.72));
        for (const sx of [-1, 1]) paint.push(G.part(G.box(0.12, 0.07, 1.98), 0xffffff, sx * (W / 2 - 0.13), 1.2, 1.72));
        paint.push(G.part(G.box(W - 0.2, 0.07, 0.1), 0xffffff, 0, 1.2, 2.68));
      },
    });
  }

  // Flatbed: the semi's tractor with an open deck. Its load rides on top as separate pieces.
  function flatbed() {
    const L = 16.6, W = 2.5;
    return Object.assign(buildCar(Object.assign(tractorSpec(W, L), {
      extra(o) {
        tractorDetail(o, W);
        const { trim, lights } = o;
        trim.push(G.part(G.box(W, 0.14, 12.7), 0x6b4a2c, 0, 1.28, 1.85));
        for (let i = 0; i < 12; i++) trim.push(G.part(G.box(W + 0.01, 0.142, 0.03), 0x4a3320, 0, 1.28, -4.2 + i * 1.05));
        trim.push(G.part(G.box(W - 0.3, 0.35, 12.7), 0x222326, 0, 1.03, 1.85));
        trim.push(G.part(G.box(W, 1.2, 0.12), 0x2a2c30, 0, 1.95, -4.45));
        for (let i = 0; i < 5; i++) trim.push(G.part(G.box(W - 0.2, 0.06, 0.14), 0x9aa0a6, 0, 1.5 + i * 0.22, -4.43));
        for (const sx of [-1, 1]) {
          trim.push(G.part(G.box(0.06, 0.14, 12.7), 0xb9bec4, sx * (W / 2 + 0.01), 1.2, 1.85));
          for (let i = 0; i < 10; i++) trim.push(G.part(G.box(0.07, 0.42, 0.07), 0x2a2c30, sx * (W / 2 - 0.02), 1.56, -3.9 + i * 1.3));
          for (let i = 0; i < 16; i++) trim.push(G.part(G.box(0.02, 0.08, 0.36), i % 2 ? 0xf1f1ec : 0xc8102e, sx * (W / 2 + 0.02), 1.06, -4.2 + i * 0.8));
          // snapped load straps hanging off the side
          for (const z of [-1.2, 3.4]) trim.push(G.part(G.box(0.03, 0.62, 0.06), 0xffc72c, sx * (W / 2 + 0.04), 0.98, z, 0.12 * sx, 0, 0));
          for (const z of [5.9, 7.2]) for (const dx of [0, 0.42]) {
            const x = sx * (W / 2 - 0.24 - dx);
            trim.push(G.part(G.cyl(0.52, 0.52, 0.36, 16), 0x141517, x, 0.52, z, 0, 0, PI / 2));
            trim.push(G.part(G.cyl(0.3, 0.3, 0.38, 12), 0xb9bec4, x, 0.52, z, 0, 0, PI / 2));
          }
          lights.push(G.part(G.box(0.22, 0.22, 0.04), 0xff2a2a, sx * 1.05, 1.05, 8.23));
        }
        trim.push(G.part(G.box(W - 0.1, 0.12, 0.14), 0x2a2c30, 0, 0.55, 8.15));
      },
    })), { hw: W / 2, hl: L / 2, h: 3.7 });
  }

  // Car carrier with its rear deck tilted down to the road as a loading ramp. The upper deck
  // runs to a headrack over the cab: drive up, along the top and off the front.
  // Built in the semi's coordinates, then shifted 1.6 m back so the body box is centred.
  Models.CARRIER = { shift: 1.6, foot: 14.2, rampTop: 6.6, deckEnd: -1.0, kickTop: -3.0, deckY: 2.75, kickY: 3.95, hl: 7.6 };
  function carrier() {
    const L = 16.6, W = 2.5;
    const steel = 0x8e959b, deck = 0x646a71, yellow = 0xffc72c;
    const car = buildCar(Object.assign(tractorSpec(W, L), {
      extra(o) {
        tractorDetail(o, W);
        const { trim, lights } = o;
        for (const sx of [-1, 1]) trim.push(G.part(G.box(0.14, 0.3, 12.0), 0x2a2c30, sx * 0.95, 0.85, 2.2));
        trim.push(G.part(G.box(W - 0.2, 0.08, 9.8), 0x5d636a, 0, 1.0, 1.1));
        for (const sx of [-1, 1]) for (const z of [-3.6, -0.8, 2.0, 4.8]) trim.push(G.part(G.box(0.12, 1.75, 0.12), steel, sx * (W / 2 - 0.08), 1.85, z));
        // upper deck, top surface at 2.75
        trim.push(G.part(G.box(W - 0.2, 0.1, 7.6), deck, 0, 2.7, 1.2));
        for (const sx of [-1, 1]) trim.push(G.part(G.box(0.06, 0.2, 7.6), yellow, sx * (W / 2 - 0.12), 2.84, 1.2));
        // the tilted rear deck: two tyre tracks down to the road at z = 12.6
        const rl = Math.hypot(7.6, 2.7), ra = Math.atan2(2.7, 7.6);
        for (const sx of [-0.78, 0.78]) {
          trim.push(G.part(G.box(0.74, 0.08, rl), deck, sx, 1.35, 8.8, ra, 0, 0));
          trim.push(G.part(G.box(0.05, 0.14, rl), yellow, sx + Math.sign(sx) * 0.38, 1.4, 8.8, ra, 0, 0));
        }
        for (let i = 1; i < 5; i++) {
          const t = i / 5, z = 5.0 + 7.6 * t, y = 2.7 * (1 - t);
          trim.push(G.part(G.box(2.1, 0.06, 0.08), steel, 0, y - 0.07, z));
          if (y > 1.15) for (const sx of [-1, 1]) trim.push(G.part(G.box(0.08, y - 1.0, 0.08), steel, sx * 0.95, 1.0 + (y - 1.0) / 2, z));
        }
        // headrack kicker over the cab
        const kl = Math.hypot(2, 1.2), ka = Math.atan2(1.2, 2);
        for (const sx of [-0.78, 0.78]) {
          trim.push(G.part(G.box(0.74, 0.08, kl), deck, sx, 3.3, -3.6, ka, 0, 0));
          trim.push(G.part(G.box(0.05, 0.14, kl), yellow, sx + Math.sign(sx) * 0.38, 3.36, -3.6, ka, 0, 0));
        }
        for (const sx of [-1, 1]) trim.push(G.part(G.box(0.1, 2.95, 0.1), steel, sx * 0.95, 2.45, -4.45));
        trim.push(G.part(G.box(2.2, 0.08, 0.1), steel, 0, 3.86, -4.55));
        for (const sx of [-1, 1]) {
          for (const z of [6.2, 7.5]) for (const dx of [0, 0.42]) {
            const x = sx * (W / 2 - 0.24 - dx);
            trim.push(G.part(G.cyl(0.52, 0.52, 0.36, 16), 0x141517, x, 0.52, z, 0, 0, PI / 2));
            trim.push(G.part(G.cyl(0.3, 0.3, 0.38, 12), 0xb9bec4, x, 0.52, z, 0, 0, PI / 2));
          }
          for (let i = 0; i < 14; i++) trim.push(G.part(G.box(0.02, 0.08, 0.36), i % 2 ? 0xf1f1ec : 0xc8102e, sx * (W / 2 + 0.006), 0.92, -3.6 + i * 0.85));
          lights.push(G.part(G.box(0.22, 0.22, 0.04), 0xff2a2a, sx * 1.05, 0.95, 8.3));
          for (let i = 0; i < 4; i++) lights.push(G.part(G.box(0.03, 0.06, 0.08), 0xffa630, sx * (W / 2 - 0.08), 2.97, -1.8 + i * 2.2));
        }
        trim.push(G.part(G.box(W - 0.1, 0.12, 0.14), 0x2a2c30, 0, 0.55, 8.25));
        for (let i = 0; i < 6; i++) trim.push(G.part(G.box(0.3, 0.03, 0.3), i % 2 ? 0x17191b : yellow, -0.85 + i * 0.34, 0.02, 12.45));
      },
    }));
    for (const p of car.parts) p.geo.translate(0, 0, Models.CARRIER.shift);
    return Object.assign(car, { hw: W / 2, hl: Models.CARRIER.hl, h: 3.9 });
  }

  Models.trafficKinds = function () {
    return {
      sedan: buildCar(SEDAN),
      hatch: buildCar({
        L: 4.15, W: 1.8, wheelR: 0.31, axles: [1.28, -1.28],
        body: [['m', 2.0, 0.25], ['l', 2.08, 0.4], ['q', 2.12, 0.64, 1.95, 0.72], ['q', 1.35, 0.8, 0.8, 0.86], ['l', -1.62, 0.9], ['q', -1.96, 0.92, -2.04, 0.86], ['q', -2.1, 0.62, -2.04, 0.4], ['l', -1.96, 0.25]],
        arches: [[-1.28, 0.31, 0.38, 0.25], [1.28, 0.31, 0.38, 0.25]],
        planZ: [-2.1, -1.7, -1.28, 0, 1.28, 1.7, 2.1], planW: [0.84, 0.96, 1, 0.985, 1, 0.98, 0.9], tumbleY: 0.62,
        cabin: [['m', 0.88, 0.8], ['q', 0.5, 1.05, 0.22, 1.36], ['q', -0.6, 1.44, -1.55, 1.38], ['q', -1.94, 1.22, -2.0, 0.92], ['l', -2.0, 0.8], ['l', 0.88, 0.8]],
        cabinW: 0.82, belt: 0.88, roofY: 1.42, pillars: [0.22],
        head: [0.58, 0.62, 0.36, 0.11], tail: [0.66, 0.8, 0.14, 0.24], grille: [0.7, 0.14, 0.48], plateY: 0.54, bumperY: 0.32,
        mirrorZ: -0.7, handles: [-0.05],
      }),
      suv: buildCar({
        L: 4.95, W: 2.0, wheelR: 0.4, tireW: 0.27, axles: [1.55, -1.55], rim: 0xb9bec4,
        body: [['m', 2.4, 0.38], ['l', 2.47, 0.55], ['q', 2.52, 0.88, 2.32, 0.98], ['q', 1.75, 1.04, 1.05, 1.08], ['l', -2.0, 1.1], ['q', -2.4, 1.1, -2.46, 0.95], ['q', -2.52, 0.62, -2.42, 0.45], ['l', -2.32, 0.38]],
        arches: [[-1.55, 0.4, 0.47, 0.38], [1.55, 0.4, 0.47, 0.38]],
        planZ: [-2.5, -2.0, -1.55, 0, 1.55, 2.0, 2.5], planW: [0.86, 0.97, 1, 0.99, 1, 0.98, 0.9], tumbleY: 0.85, tumbleK: 0.2,
        cabin: [['m', 1.12, 1.02], ['q', 0.78, 1.3, 0.55, 1.68], ['q', -0.5, 1.76, -2.12, 1.72], ['q', -2.38, 1.6, -2.42, 1.12], ['l', -2.42, 1.0], ['l', 1.12, 1.0]],
        cabinW: 0.84, belt: 1.08, roofY: 1.76, pillars: [0.28, 1.4],
        head: [0.66, 0.88, 0.42, 0.14], tail: [0.82, 1.0, 0.16, 0.34], grille: [1.05, 0.3, 0.72], plateY: 0.74, bumperY: 0.5,
        mirrorZ: -0.95, handles: [-0.15, 0.85],
        extra({ trim }) {
          for (const sx of [-0.62, 0.62]) trim.push(G.part(G.box(0.05, 0.05, 2.3), 0x2a2c30, sx, 1.79, 0.75));
        },
      }),
      pickup: pickup(),
      box: boxTruck(),
      semi: semi(),
      flatbed: flatbed(),
      carrier: carrier(),
    };
  };

  // Highway patrol cruiser: black with white doors and roof, lightbar, push bar.
  Models.cruiserParts = function () { return cruiser(); };

  // ================================================================ hazards (instanced)
  Models.staticKinds = function () {
    const m = Models.mats();
    const out = {};

    // Jersey barrier set across a lane, hazard board facing traffic.
    {
      const sh = new T.Shape();
      sh.moveTo(-0.3, 0); sh.lineTo(0.3, 0); sh.lineTo(0.3, 0.08); sh.lineTo(0.13, 0.32);
      sh.lineTo(0.08, 0.81); sh.lineTo(-0.08, 0.81); sh.lineTo(-0.13, 0.32); sh.lineTo(-0.3, 0.08);
      const g = new T.ExtrudeGeometry(sh, { depth: 3.3, bevelEnabled: false });
      g.translate(0, 0, -1.65);
      g.rotateY(PI / 2);
      // after rotation the profile faces along z: x is now the 3.3 m length across the lane
      const parts = [{ g, c: 0xbdb8ac }];
      for (let i = 0; i < 8; i++) parts.push(G.part(G.box(0.36, 0.26, 0.02), i % 2 ? 0x17191b : 0xffc72c, -1.26 + i * 0.36, 0.55, 0.115, -0.1, 0, 0));
      parts.push(G.part(G.box(3.3, 0.06, 0.02), 0xf6f7f3, 0, 0.76, 0.085, -0.1, 0, 0));
      out.barrier = { parts: [{ geo: G.merge(parts), mat: m.vc }, { geo: new T.PlaneGeometry(3.8, 1.3).rotateX(-PI / 2).translate(0, 0.03, 0), mat: m.shadow }], hw: 1.65, hl: 0.3, h: 0.81 };
    }

    // Traffic cone
    out.cone = {
      parts: [{
        geo: G.merge([
          G.part(G.box(0.42, 0.04, 0.42), 0x17191b, 0, 0.02, 0),
          G.part(G.cyl(0.04, 0.19, 0.7, 10), 0xff6a13, 0, 0.39, 0),
          G.part(G.cyl(0.1, 0.135, 0.13, 10), 0xf6f7f3, 0, 0.47, 0),
        ]), mat: m.vc,
      }],
      hw: 0.24, hl: 0.24, h: 0.72,
    };

    // Spike strip across a lane
    {
      const parts = [G.part(G.box(3.3, 0.035, 0.32), 0x2b2d30, 0, 0.018, 0)];
      for (let i = 0; i < 24; i++) {
        for (const z of [-0.08, 0.08]) parts.push(G.part(new T.ConeGeometry(0.028, 0.09, 4), 0xc4c9ce, -1.6 + i * 0.139, 0.075, z));
      }
      parts.push(G.part(G.box(0.18, 0.06, 0.4), 0xffc72c, -1.72, 0.03, 0));
      parts.push(G.part(G.box(0.18, 0.06, 0.4), 0xffc72c, 1.72, 0.03, 0));
      out.spikes = { parts: [{ geo: G.merge(parts), mat: m.vc }], hw: 1.65, hl: 0.2, h: 0.09 };
    }

    // Low-clearance bar spanning the carriageway
    {
      const parts = [];
      for (const x of [-7.4, 8.8]) {
        for (let i = 0; i < 6; i++) parts.push(G.part(G.box(0.32, 0.5, 0.32), i % 2 ? 0x17191b : 0xffc72c, x, 0.25 + i * 0.5, 0));
      }
      const x0 = -7.4, x1 = 8.8, n = 26, seg = (x1 - x0) / n;
      for (let i = 0; i < n; i++) parts.push(G.part(G.box(seg, 0.3, 0.26), i % 2 ? 0x17191b : 0xffc72c, x0 + seg * (i + 0.5), 1.3, 0));
      parts.push(G.part(G.box(x1 - x0 + 0.4, 0.2, 0.3), 0x8e959b, (x0 + x1) / 2, 3.1, 0));
      parts.push(G.part(G.box(2.6, 0.7, 0.05), 0x17191b, 0, 2.15, 0.02));
      parts.push(G.part(G.box(2.45, 0.56, 0.06), 0xffc72c, 0, 2.15, 0.03));
      for (const x of [-0.9, 0, 0.9]) {
        parts.push(G.part(G.box(0.06, 0.4, 0.07), 0x17191b, x, 2.15, 0.04));
      }
      for (const x of [-5.2, -2.2, 0.7, 3.6, 6.6]) parts.push(G.part(G.box(0.03, 1.6, 0.03), 0x6a6f74, x, 2.2, 0));
      out.lowbar = { parts: [{ geo: G.merge(parts), mat: m.vc }], hw: 8.1, hl: 0.15, h: 1.45 };
    }

    // Jackknifed semi trailer lying across the lanes. Local x runs along the trailer,
    // kingpin end at -6.5, rear axles at the +x end. Underside sits at y = CLEAR.
    {
      const C = EZ.C;
      const parts = [
        G.part(G.box(13, 2.6, 2.5), 0xdcddd8, 0, C.CLEAR + 1.3, 0),
        G.part(G.box(13.02, 0.22, 2.52), 0x1b4c8c, 0, C.CLEAR + 2.25, 0),
        G.part(G.box(13, 0.16, 2.3), 0x222326, 0, C.CLEAR + 0.08, 0),
        G.part(G.box(0.08, 2.4, 2.3), 0xb9bab5, 6.51, C.CLEAR + 1.3, 0),
      ];
      for (const x of [4.6, 5.8]) {
        for (const z of [-0.85, 0.85]) {
          parts.push(G.part(G.cyl(0.52, 0.52, 0.5, 14), 0x151618, x, 0.52, z, PI / 2, 0, 0));
          parts.push(G.part(G.cyl(0.3, 0.3, 0.52, 10), 0x8b9199, x, 0.52, z, PI / 2, 0, 0));
        }
      }
      parts.push(G.part(G.box(2.3, 0.4, 1.4), 0x2a2c30, 5.2, 0.95, 0));
      for (let i = 0; i < 9; i++) parts.push(G.part(G.box(0.7, 0.18, 0.03), i % 2 ? 0xf6f7f3 : 0xc8102e, -6.0 + i * 1.5, C.CLEAR + 0.25, 1.27));
      out.trailer = { parts: [{ geo: G.merge(parts), mat: m.vc }, { geo: new T.PlaneGeometry(14, 3.4).rotateX(-PI / 2).translate(0, 0.03, 0), mat: m.shadow }], hw: 6.5, hl: 1.25, h: C.CLEAR + 2.6 };
    }

    // The tractor unit, slewed at an angle beside the kingpin end: the semi's cab, nose moved to z = -2.15.
    {
      const t = buildCar(Object.assign(tractorSpec(2.5, 6), { extra: (o) => tractorDetail(o, 2.5) }));
      t.parts.pop();
      for (const part of t.parts) part.geo.translate(0, 0, 7.05);
      const sh = shadowPart(2.5, 6.2);
      sh.geo.translate(0, 0, 0.75);
      t.parts.push(sh);
      out.tractor = Object.assign(t, { hw: 1.4, hl: 3.2, h: 3.3 });
    }

    // Flashing arrow board on a small trailer
    const arrowBoard = (dir) => {
      const parts = [
        G.part(G.box(2.2, 1.3, 0.14), 0x17191b, 0, 2.1, 0),
        G.part(G.box(0.12, 1.5, 0.12), 0x8e959b, 0, 0.75, -0.15),
        G.part(G.box(1.8, 0.35, 1.5), 0xffc72c, 0, 0.55, -0.6),
        G.part(G.cyl(0.3, 0.3, 0.2, 10), 0x151618, -0.95, 0.3, -0.6, 0, 0, PI / 2),
        G.part(G.cyl(0.3, 0.3, 0.2, 10), 0x151618, 0.95, 0.3, -0.6, 0, 0, PI / 2),
        G.part(G.box(2.0, 0.12, 0.05), 0xffc72c, 0, 0.6, 0.16),
      ];
      const lamps = [];
      const dot = (x, y) => lamps.push(G.part(G.box(0.12, 0.12, 0.04), 0xffffff, dir * x, 2.1 + y, 0.09));
      for (let i = 0; i < 9; i++) dot(-0.75 + i * 0.16, 0);
      for (let i = 1; i <= 3; i++) { dot(0.55 - i * 0.14, i * 0.14); dot(0.55 - i * 0.14, -i * 0.14); }
      return { parts: [{ geo: G.merge(parts), mat: m.vc }, { geo: G.merge(lamps), mat: m.amber }], hw: 1.1, hl: 0.8, h: 2.8 };
    };
    out.arrowL = arrowBoard(-1);
    out.arrowR = arrowBoard(1);

    return out;
  };

  // Charge cells: the things you collect. Shaped like a lightning bolt.
  Models.voltParts = function () {
    const m = Models.mats();
    const b = new T.Shape();
    b.moveTo(0.12, 0.5); b.lineTo(-0.24, -0.04); b.lineTo(-0.02, -0.04); b.lineTo(-0.12, -0.5);
    b.lineTo(0.26, 0.08); b.lineTo(0.03, 0.08); b.lineTo(0.12, 0.5);
    const g = new T.ExtrudeGeometry(b, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    g.translate(0, 0, -0.05);
    return [{ geo: g, mat: m.volt }];
  };

  // ================================================================ scenery (instanced)
  Models.sceneryKinds = function () {
    const m = Models.mats();
    const out = {};
    const vc = (parts) => [{ geo: G.merge(parts), mat: m.vc }];

    // fan palm
    {
      const p = [];
      let x = 0, y = 0;
      for (let i = 0; i < 6; i++) {
        const lean = 0.05 + i * 0.03;
        p.push(G.part(G.cyl(0.2 - i * 0.015, 0.24 - i * 0.015, 1.7, 7), i % 2 ? 0x8a6a4b : 0x7b5d41, x, y + 0.85, 0, 0, 0, -lean));
        x += Math.sin(lean) * 1.7; y += Math.cos(lean) * 1.7;
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * PI * 2;
        p.push(G.part(G.taperBox(0.75, 0.06, 3.2, 0.12, 2.9, 0.15), i % 2 ? 0x4f7a3d : 0x5f8a44, x + Math.cos(a) * 1.3, y - 0.35, Math.sin(a) * 1.3, 0.5, -a + PI / 2, 0));
      }
      p.push(G.part(new T.IcosahedronGeometry(0.42, 0), 0x6a4e33, x, y - 0.3, 0));
      out.palm = vc(p);
    }
    out.scrub = vc([
      G.part(new T.IcosahedronGeometry(1, 0), 0x7f8450, 0, 0.55, 0, 0, 0, 0, 1.5, 0.75, 1.3),
      G.part(new T.IcosahedronGeometry(0.7, 0), 0x6e7546, 0.9, 0.4, 0.4, 0, 0, 0, 1.2, 0.8, 1.1),
    ]);
    {
      const g = new T.DodecahedronGeometry(1, 0);
      const pos = g.attributes.position;
      const r = EZ.rng(7);
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.8 + r() * 0.4), pos.getY(i) * (0.6 + r() * 0.3), pos.getZ(i) * (0.8 + r() * 0.4));
      g.computeVertexNormals();
      out.rock = vc([G.part(g, 0x8e7d68, 0, 0.35, 0)]);
    }
    // saguaro
    out.cactus = vc([
      G.part(G.cyl(0.34, 0.4, 6.2, 9), 0x587244, 0, 3.1, 0),
      G.part(new T.SphereGeometry(0.34, 9, 5, 0, PI * 2, 0, PI / 2), 0x587244, 0, 6.2, 0),
      G.part(G.cyl(0.22, 0.22, 1.2, 8), 0x4f6a3d, 0.7, 2.6, 0, 0, 0, PI / 2),
      G.part(G.cyl(0.22, 0.24, 2.0, 8), 0x4f6a3d, 1.25, 3.5, 0),
      G.part(G.cyl(0.2, 0.2, 1.0, 8), 0x4f6a3d, -0.6, 3.3, 0, 0, 0, PI / 2),
      G.part(G.cyl(0.2, 0.22, 1.6, 8), 0x4f6a3d, -1.05, 4.0, 0),
    ]);
    // joshua tree
    {
      const p = [G.part(G.cyl(0.25, 0.35, 3.0, 7), 0x6f5c45, 0, 1.5, 0)];
      const arms = [[0.9, 0.7], [-0.8, 0.6], [0.2, -0.9], [-0.3, 1.0]];
      for (const [dx, dz] of arms) {
        const a = new T.Vector3(0, 2.8, 0), b = new T.Vector3(dx * 1.4, 4.2, dz * 1.2);
        p.push(G.beam(a, b, 0.24, 0x6f5c45));
        p.push(G.part(new T.ConeGeometry(0.55, 0.9, 7), 0x5d6b3e, b.x, b.y + 0.3, b.z));
      }
      out.joshua = vc(p);
    }
    // pine
    out.pine = vc([
      G.part(G.cyl(0.18, 0.28, 2.2, 6), 0x5a4231, 0, 1.1, 0),
      G.part(new T.ConeGeometry(2.3, 4.0, 8), 0x2f4b3b, 0, 3.6, 0),
      G.part(new T.ConeGeometry(1.8, 3.4, 8), 0x36573f, 0, 5.6, 0),
      G.part(new T.ConeGeometry(1.2, 2.8, 8), 0x3d6145, 0, 7.4, 0),
    ]);
    out.snowpine = vc([
      G.part(G.cyl(0.18, 0.28, 2.2, 6), 0x5a4231, 0, 1.1, 0),
      G.part(new T.ConeGeometry(2.3, 4.0, 8), 0x2f4b3b, 0, 3.6, 0),
      G.part(new T.ConeGeometry(1.8, 3.4, 8), 0x3f5e4a, 0, 5.6, 0),
      G.part(new T.ConeGeometry(1.2, 2.8, 8), 0xe8eef0, 0, 7.4, 0),
    ]);
    // lattice pylon with three sagging conductors back to the previous tower (80 m)
    {
      const p = [];
      const H = 26;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        p.push(G.beam(new T.Vector3(sx * 2.4, 0, sz * 2.4), new T.Vector3(sx * 0.7, H, sz * 0.7), 0.22, 0x8f959b));
      }
      for (let i = 1; i < 6; i++) {
        const y = (i / 6) * H, w = EZ.lerp(2.4, 0.7, i / 6);
        p.push(G.part(G.box(w * 2, 0.12, 0.12), 0x8f959b, 0, y, w));
        p.push(G.part(G.box(w * 2, 0.12, 0.12), 0x8f959b, 0, y, -w));
        p.push(G.part(G.box(0.12, 0.12, w * 2), 0x8f959b, w, y, 0));
        p.push(G.part(G.box(0.12, 0.12, w * 2), 0x8f959b, -w, y, 0));
      }
      p.push(G.part(G.box(11, 0.3, 0.5), 0x8f959b, 0, H - 2, 0));
      p.push(G.part(G.box(7, 0.3, 0.5), 0x8f959b, 0, H + 1, 0));
      for (const [x, y] of [[-5.2, H - 2.6], [5.2, H - 2.6], [0, H + 0.4]]) {
        p.push(G.beam(new T.Vector3(x, y, 0), new T.Vector3(x, y - 5.5, 40), 0.06, 0x2e3133));
        p.push(G.beam(new T.Vector3(x, y - 5.5, 40), new T.Vector3(x, y, 80), 0.06, 0x2e3133));
      }
      out.pylon = vc(p);
    }
    // light pole on the left shoulder, one long arm reaching over the lanes
    {
      const p = [G.part(G.cyl(0.11, 0.16, 11, 8), 0x9aa0a6, 0, 5.5, 0)];
      p.push(G.beam(new T.Vector3(0, 10.6, 0), new T.Vector3(4.4, 11.1, 0), 0.12, 0x9aa0a6));
      p.push(G.beam(new T.Vector3(0, 9.4, 0), new T.Vector3(2.2, 10.85, 0), 0.07, 0x9aa0a6));
      const heads = G.merge([G.part(G.box(0.85, 0.14, 0.38), 0xffffff, 4.6, 11.0, 0)]);
      out.pole = [{ geo: G.merge(p), mat: m.vc }, { geo: heads, mat: m.lamp }];
      out.poolPair = [{ geo: G.merge([
        G.part(new T.PlaneGeometry(12, 13).rotateX(-PI / 2), 0xffffff, 5.0, 0.05, 0),
      ]), mat: m.pool }];
    }
    // shoulder delineator
    out.delineator = [
      { geo: G.merge([G.part(G.box(0.1, 1.1, 0.06), 0xf2f2ee, 0, 0.55, 0)]), mat: m.vc },
      { geo: G.merge([G.part(G.box(0.08, 0.16, 0.02), 0xffb13b, 0, 0.95, -0.04)]), mat: m.lights },
    ];
    // raised pavement markers on the lane lines
    out.catseye = [{ geo: G.merge([G.part(G.box(0.12, 0.03, 0.12), 0xf6f7f3, 0, 0.015, 0)]), mat: m.lights }];

    return out;
  };

  // Office tower: facade texture repeats every 14 m across and 28 m up.
  Models.buildingGeo = function (w, h, d) {
    const g = new T.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const faces = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * faces[f][0] / 14, uv.getY(k) * faces[f][1] / 28);
      }
    }
    g.translate(0, h / 2, 0);
    return g;
  };

  // ================================================================ suction tube
  // A steel cage over two lanes. Each lane has a track that twists up the wall to the ceiling,
  // then a ceiling deck runs on, upside down. The car follows exactly this profile.
  Models.tubeProfile = function () {
    const R = EZ.C.TUBE_R;
    const a0 = Math.asin(1.8 / R);
    const lip = (a) => (R - R * Math.cos(a0)) * (1 - EZ.smoothstep(a0, a0 + 0.8, a));
    // side -1 climbs the left wall, +1 the right; a runs from a0 (lane centre, on the road) to PI (ceiling)
    const point = (side, a) => [side * R * Math.sin(a), R - R * Math.cos(a) - lip(a)];
    return { R, a0, point };
  };
  Models.suctionTube = function () {
    const C = EZ.C, LC = C.TUBE_CLIMB, L = C.TUBE_CLIMB + C.TUBE_CEIL;
    const { R, a0, point } = Models.tubeProfile();
    const V = (x, y, z) => new T.Vector3(x, y, z);
    const frame = [];
    const ring = [];
    for (let i = 0; i <= 10; i++) ring.push(point(1, a0 + ((PI - a0) * i) / 10));
    for (let i = 9; i >= 0; i--) ring.push(point(-1, a0 + ((PI - a0) * i) / 10));
    for (let z = 0; z <= L + 0.1; z += 6) {
      const portal = z === 0 || z + 6 > L + 0.1;
      for (let k = 0; k < ring.length - 1; k++) {
        const [x1, y1] = ring[k], [x2, y2] = ring[k + 1];
        frame.push(G.beam(V(x1, y1, -z), V(x2, y2, -z), portal ? 0.26 : 0.15, portal ? (k % 2 ? 0x17191b : 0xffc72c) : 0x9aa0a6));
      }
    }
    for (const k of [3, 7, 10, 13, 17]) {
      const [x, y] = ring[k];
      frame.push(G.beam(V(x, y, 0), V(x, y, -L), 0.1, 0x7d8389));
    }
    // twisting tracks, one per lane, with yellow edges
    const deck = [];
    const N = 36, W = 1.3;
    for (const side of [-1, 1]) {
      const rows = [];
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * LC;
        const a = a0 + (PI - a0) * EZ.smoothstep(0, 1, u / LC);
        const [x, y] = point(side, a);
        const tx = side * Math.cos(a), ty = Math.sin(a);
        rows.push([V(x - tx * W, y - ty * W, -u), V(x + tx * W, y + ty * W, -u)]);
      }
      const pos = [];
      for (let i = 0; i < N; i++) {
        const [a1, b1] = rows[i], [a2, b2] = rows[i + 1];
        for (const v of [a1, b1, b2, a1, b2, a2]) pos.push(v.x, v.y, v.z);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      deck.push({ g, c: 0x2e3238 });
      for (let i = 0; i < N; i++) {
        for (const e of [0, 1]) frame.push(G.beam(rows[i][e], rows[i + 1][e], 0.09, 0xffc72c));
      }
    }
    deck.push(G.part(G.box(3.0, 0.14, C.TUBE_CEIL), 0x2e3238, 0, 2 * R + 0.07, -(LC + C.TUBE_CEIL / 2)));
    for (const sx of [-1.5, 1.5]) frame.push(G.beam(V(sx, 2 * R - 0.02, -LC), V(sx, 2 * R - 0.02, -L), 0.09, 0xffc72c));
    const group = new T.Group();
    group.add(new T.Mesh(G.merge(frame), Models.mats().vc));
    group.add(new T.Mesh(G.merge(deck), new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));
    group.visible = false;
    return { group };
  };

  // ================================================================ set pieces (instanced)
  Models.challengeKinds = function () {
    const m = Models.mats();
    const out = {};

    // Toll plaza: a canopy over the three lanes, booths on islands along the lane lines.
    // Local z = 0 is the booth line; +z faces the traffic coming in.
    {
      const parts = [];
      const X0 = -7.5, X1 = 9.0, cx = (X0 + X1) / 2, w = X1 - X0;
      parts.push(G.part(G.box(w, 0.55, 9.6), 0xe4e2dc, cx, 5.75, 0));
      parts.push(G.part(G.box(w + 0.1, 0.9, 0.16), 0x0e6b4e, cx, 5.35, 4.85));
      parts.push(G.part(G.box(w + 0.1, 0.12, 0.18), 0xf4f6f2, cx, 4.86, 4.86));
      parts.push(G.part(G.box(w, 0.08, 9.4), 0x9aa0a6, cx, 5.44, 0));
      for (const x of [-5.4, -1.8, 1.8, 5.4]) {
        parts.push(G.part(G.box(1.1, 0.22, 12), 0xcfcbc1, x, 0.11, 0));
        parts.push(G.part(G.box(1.12, 0.05, 12.02), 0xffc72c, x, 0.2, 0));
        // crash cushion on the nose of each island, facing traffic
        parts.push(G.part(G.box(0.9, 0.9, 0.9), 0xffc72c, x, 0.67, 6.4));
        for (let i = 0; i < 3; i++) parts.push(G.part(G.box(0.92, 0.1, 0.92), 0x17191b, x, 0.42 + i * 0.24, 6.4));
        parts.push(G.part(G.box(1.0, 2.5, 2.4), 0xd9dcd6, x, 1.47, 0));
        parts.push(G.part(G.box(1.04, 0.75, 1.9), 0x1d2933, x, 1.9, 0));
        parts.push(G.part(G.box(1.2, 0.12, 2.7), 0x8e959b, x, 2.78, 0));
        for (const z of [-4.2, 4.2]) parts.push(G.part(G.box(0.34, 5.3, 0.34), 0x9aa0a6, x, 2.86, z));
      }
      // gate posts: each lane's arm pivots on the island to its left
      for (const l of EZ.LANES) {
        const px = EZ.laneX(l) - 1.25;
        parts.push(G.part(G.box(0.26, 1.1, 0.26), 0xffc72c, px - 0.08, 0.66, 1.6));
        parts.push(G.part(G.box(0.3, 0.26, 0.32), 0x17191b, px - 0.08, 1.22, 1.6));
        parts.push(G.part(G.box(1.3, 1.0, 0.1), 0x17191b, EZ.laneX(l), 4.35, 4.88));
      }
      const cv = G.canvas(1024, 64), c = cv.getContext('2d');
      c.fillStyle = '#0E6B4E'; c.fillRect(0, 0, 1024, 64);
      c.fillStyle = '#F4F6F2'; c.font = `800 40px Overpass, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('TOLL PLAZA  ·  NO CASH  ·  NO STOPPING', 512, 34);
      const sign = { geo: new T.PlaneGeometry(10, 0.62).translate(cx, 5.37, 4.94), mat: new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv) }) };
      out.toll = { parts: [{ geo: G.merge(parts), mat: m.vc }, sign], hw: 8, hl: 6.5, h: 6 };
    }
    // Barrier arm: pivots at its left end. Down it lies across the lane at windscreen height.
    {
      const parts = [G.part(G.box(0.16, 0.16, 0.16), 0x17191b, 0, 0, 0)];
      for (let i = 0; i < 8; i++) parts.push(G.part(G.box(0.32, 0.1, 0.1), i % 2 ? 0xf6f7f3 : 0xc8102e, 0.16 + i * 0.32, 0, 0));
      out.gate = { parts: [{ geo: G.merge(parts), mat: m.vc }, { geo: G.merge([G.part(G.box(0.08, 0.08, 0.12), 0xff2a2a, 2.52, 0.07, 0)]), mat: m.lights }], hw: 1.3, hl: 0.1, h: 0.2 };
    }
    // Lane signals under the fascia: green arrow open, red cross closed
    out.tollGo = {
      parts: [{ geo: G.merge([
        G.part(G.box(0.14, 0.5, 0.03), 0x2bff7a, 0, 0.05, 0),
        G.part(G.box(0.14, 0.36, 0.03), 0x2bff7a, -0.11, -0.145, 0, 0, 0, PI / 4),
        G.part(G.box(0.14, 0.36, 0.03), 0x2bff7a, 0.11, -0.145, 0, 0, 0, -PI / 4),
      ]), mat: m.lights }], hw: 0.6, hl: 0.1, h: 1,
    };
    out.tollStop = {
      parts: [{ geo: G.merge([
        G.part(G.box(0.13, 0.72, 0.03), 0xff2a3a, 0, 0, 0, 0, 0, PI / 4),
        G.part(G.box(0.13, 0.72, 0.03), 0xff2a3a, 0, 0, 0, 0, 0, -PI / 4),
      ]), mat: m.lights }], hw: 0.6, hl: 0.1, h: 1,
    };

    // Cargo off the flatbed. Both are centred on their own middle so they tumble properly.
    {
      const p = [G.part(G.box(0.96, 0.86, 0.96), 0xb07c45, 0, 0, 0)];
      for (const y of [-0.3, 0, 0.3]) p.push(G.part(G.box(0.99, 0.1, 0.99), 0x8a5c30, 0, y, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(G.part(G.box(0.12, 0.9, 0.12), 0x6e4724, sx * 0.44, 0, sz * 0.44));
      for (const sx of [-1, 1]) p.push(G.part(G.box(0.02, 0.2, 0.46), 0x2a1c10, sx * 0.5, 0.15, 0));
      out.crate = { parts: [{ geo: G.merge(p), mat: m.vc }], hw: 0.5, hl: 0.5, h: 0.9 };
    }
    {
      // a drum lying on its side, axis along z; stood up on the deck with pitch = PI / 2
      const body = [G.part(G.cyl(0.3, 0.3, 0.86, 16), 0xffffff, 0, 0, 0, PI / 2, 0, 0)];
      for (const z of [-0.2, 0.2]) body.push(G.part(G.cyl(0.312, 0.312, 0.04, 16), 0xffffff, 0, 0, z, PI / 2, 0, 0));
      const trim = [];
      for (const z of [-0.435, 0.435]) trim.push(G.part(G.cyl(0.27, 0.27, 0.01, 14), 0x3a3d42, 0, 0, z, PI / 2, 0, 0));
      for (const a of [0, PI]) trim.push(G.part(G.box(0.16, 0.16, 0.01), 0xffc72c, Math.cos(a) * 0.3, 0, 0, 0, PI / 2, PI / 4));
      out.drum = { parts: [{ geo: G.merge(body), mat: m.paint, tint: true }, { geo: G.merge(trim), mat: m.vc }], hw: 0.32, hl: 0.45, h: 0.6 };
    }
    // Tumbleweed blown across the road by a gust
    {
      const p = [G.part(new T.IcosahedronGeometry(0.3, 0), 0x6f5532, 0, 0, 0)];
      for (let i = 0; i < 6; i++) p.push(G.part(new T.TorusGeometry(0.48 - (i % 2) * 0.06, 0.03, 4, 14), i % 2 ? 0x9a7a4a : 0x80643a, 0, 0, 0, i * 0.7, i * 1.3, i * 0.45));
      out.tumble = { parts: [{ geo: G.merge(p), mat: m.vc }], hw: 0.5, hl: 0.5, h: 1.0 };
    }
    // Windsock on the shoulder. The sock streams along +x.
    {
      const p = [G.part(G.cyl(0.05, 0.07, 5.2, 8), 0xc9ced3, 0, 2.6, 0), G.part(G.box(0.5, 0.06, 0.5), 0x8e959b, 0, 0.03, 0), G.part(G.cyl(0.36, 0.36, 0.05, 14), 0x8e959b, 0.22, 5.0, 0, 0, 0, PI / 2)];
      for (let i = 0; i < 5; i++) {
        const r0 = 0.34 - i * 0.045, r1 = 0.34 - (i + 1) * 0.045;
        p.push(G.part(G.cyl(r1, r0, 0.42, 12), i % 2 ? 0xf6f7f3 : 0xff6a13, 0.46 + i * 0.42, 5.0 - i * 0.03, 0, 0, 0, -PI / 2));
      }
      out.windsock = { parts: [{ geo: G.merge(p), mat: m.vc }], hw: 0.3, hl: 0.3, h: 5.3 };
    }
    // EMP mine dropped by a drone
    {
      const p = [G.part(G.cyl(0.34, 0.4, 0.16, 16), 0x1b1d20, 0, 0.08, 0), G.part(G.cyl(0.22, 0.26, 0.06, 16), 0x3a3d42, 0, 0.18, 0)];
      const glow = [G.part(G.cyl(0.12, 0.12, 0.05, 12), 0x8fd0ff, 0, 0.22, 0)];
      for (let i = 0; i < 4; i++) glow.push(G.part(G.box(0.06, 0.03, 0.2), 0x8fd0ff, Math.cos((i * PI) / 2) * 0.3, 0.17, Math.sin((i * PI) / 2) * 0.3, 0, (-i * PI) / 2, 0));
      out.mine = { parts: [{ geo: G.merge(p), mat: m.vc }, { geo: G.merge(glow), mat: m.lights }], hw: 1.2, hl: 1.0, h: 0.3 };
    }
    return out;
  };

  // Target ring painted on the road under a mine: red while it falls, blue once armed.
  Models.empRing = function () {
    const parts = [{ g: new T.RingGeometry(1.08, 1.32, 40).rotateX(-PI / 2), c: 0xffffff }, { g: new T.CircleGeometry(1.08, 32).rotateX(-PI / 2), c: 0x262626 }];
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2;
      parts.push(G.part(G.box(0.1, 0.004, 0.46), 0xffffff, Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5, 0, a, 0));
    }
    const mat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    return [{ geo: G.merge(parts), mat, tint: true }];
  };

  // Police drone: four rotors, a light bar and an EMP pod underneath.
  Models.drone = function () {
    const m = Models.mats();
    const g = new T.Group();
    const parts = [
      G.part(G.box(0.62, 0.16, 0.8), 0x1b1d20, 0, 0, 0),
      G.part(G.taperBox(0.5, 0.12, 0.6, 0.3, 0.36), 0x2a2d31, 0, 0.14, 0),
      G.part(G.box(0.64, 0.05, 0.14), 0xf1f1ec, 0, 0.02, -0.28),
      G.part(G.cyl(0.11, 0.14, 0.22, 10), 0x3a3d42, 0, -0.17, 0),
    ];
    const hubs = [[-0.62, -0.55], [0.62, -0.55], [-0.62, 0.55], [0.62, 0.55]];
    for (const [x, z] of hubs) {
      parts.push(G.beam(new T.Vector3(0, 0.02, 0), new T.Vector3(x, 0.06, z), 0.07, 0x2a2d31));
      parts.push(G.part(G.cyl(0.06, 0.07, 0.12, 8), 0x17191b, x, 0.08, z));
      parts.push(G.beam(new T.Vector3(x * 0.5, -0.05, z * 0.5), new T.Vector3(x * 0.6, -0.3, z * 0.62), 0.03, 0x17191b));
    }
    g.add(new T.Mesh(G.merge(parts), m.vc));
    const red = new T.Mesh(new T.BoxGeometry(0.2, 0.06, 0.08).translate(-0.16, -0.06, -0.42), m.copRed);
    const blue = new T.Mesh(new T.BoxGeometry(0.2, 0.06, 0.08).translate(0.16, -0.06, -0.42), m.copBlue);
    const glowR = new T.Mesh(new T.PlaneGeometry(0.9, 0.9).translate(-0.16, -0.06, -0.44), m.copGlowRed);
    const glowB = new T.Mesh(new T.PlaneGeometry(0.9, 0.9).translate(0.16, -0.06, -0.44), m.copGlowBlue);
    const pod = new T.Mesh(new T.SphereGeometry(0.07, 8, 6).translate(0, -0.3, 0), new T.MeshBasicMaterial({ color: 0x8fd0ff }));
    g.add(red, blue, glowR, glowB, pod);
    const disc = new T.MeshBasicMaterial({ color: 0xb9bec4, transparent: true, opacity: 0.28, depthWrite: false });
    const rotors = hubs.map(([x, z]) => {
      const r = new T.Group();
      r.position.set(x, 0.16, z);
      r.add(new T.Mesh(G.cyl(0.34, 0.34, 0.01, 18), disc));
      r.add(new T.Mesh(G.merge([G.part(G.box(0.66, 0.012, 0.05), 0x15171a, 0, 0.01, 0)]), m.vc));
      g.add(r);
      return r;
    });
    g.scale.setScalar(1.8);
    return { group: g, rotors, pod };
  };

  // ================================================================ one-off meshes
  Models.helicopter = function () {
    const g = new T.Group();
    const parts = [
      G.part(new T.SphereGeometry(1.4, 12, 8), 0x1b1d20, 0, 0, 0, 0, 0, 0, 1, 0.85, 1.6),
      G.part(G.cyl(0.25, 0.4, 5.5, 8), 0x1b1d20, 0, 0.3, 4.2, PI / 2 - 0.08, 0, 0),
      G.part(G.box(0.08, 1.4, 0.8), 0xf1f1ec, 0, 0.9, 6.8),
      G.part(G.box(0.12, 0.12, 3.2), 0x2a2c30, -0.9, -1.35, 0),
      G.part(G.box(0.12, 0.12, 3.2), 0x2a2c30, 0.9, -1.35, 0),
      G.part(G.box(1.42, 0.5, 2.0), 0xf1f1ec, 0, -0.35, -0.2),
      G.part(new T.SphereGeometry(0.85, 10, 6), 0x2b3b48, 0, 0.25, -1.45, 0, 0, 0, 1, 0.8, 0.8),
    ];
    g.add(new T.Mesh(G.merge(parts), Models.mats().vc));
    const rotor = new T.Mesh(G.merge([G.part(G.box(11, 0.06, 0.32), 0x222326, 0, 0, 0), G.part(G.box(0.32, 0.06, 11), 0x222326, 0, 0, 0)]), Models.mats().vc);
    rotor.position.y = 1.35;
    g.add(rotor);
    const tail = new T.Mesh(G.box(0.05, 1.6, 0.18), Models.mats().vc);
    tail.position.set(0.12, 0.9, 6.9);
    g.add(tail);
    const beacon = new T.Mesh(new T.SphereGeometry(0.12, 6, 4), new T.MeshBasicMaterial({ color: 0xff2038 }));
    beacon.position.set(0, -0.95, 0.4);
    g.add(beacon);
    return { group: g, rotor, tail, beacon };
  };

  // Floating power-ups, each with its own silhouette.
  Models.pickup = function (kind) {
    const g = new T.Group();
    const ring = new T.Mesh(new T.TorusGeometry(0.85, 0.06, 6, 28), new T.MeshBasicMaterial({ color: 0xf6f7f3 }));
    g.add(ring);
    const L = (c, e) => new T.MeshLambertMaterial({ color: c, emissive: e || 0x000000 });
    let icon;
    if (kind === 'charge') {
      icon = new T.Group();
      const b = new T.Mesh(G.box(0.42, 0.72, 0.22), L(0xf6f7f3, 0x333333));
      const fill = new T.Mesh(G.box(0.3, 0.42, 0.24), L(0x0e6b4e, 0x063a2a));
      fill.position.y = -0.1;
      const tip = new T.Mesh(G.box(0.18, 0.08, 0.16), L(0xf6f7f3, 0x333333));
      tip.position.y = 0.4;
      icon.add(b, fill, tip);
    } else if (kind === 'coil') {
      icon = new T.Group();
      for (let i = 0; i < 4; i++) {
        const t = new T.Mesh(new T.TorusGeometry(0.28, 0.05, 6, 18), L(0xd07a3a, 0x5a2a08));
        t.rotation.x = PI / 2;
        t.position.y = -0.24 + i * 0.16;
        icon.add(t);
      }
    } else if (kind === 'jammer') {
      icon = new T.Group();
      const box = new T.Mesh(G.box(0.5, 0.34, 0.3), L(0x2a2d31));
      const dish = new T.Mesh(new T.SphereGeometry(0.22, 10, 6, 0, PI * 2, 0, PI / 2), L(0x2f5dff, 0x0d1f66));
      dish.rotation.x = -PI / 2.6;
      dish.position.set(0, 0.32, 0);
      const ant = new T.Mesh(G.cyl(0.02, 0.02, 0.5, 5), L(0xf6f7f3));
      ant.position.set(0.18, 0.36, 0);
      icon.add(box, dish, ant);
    } else if (kind === 'shield') {
      icon = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.12, 6), new T.MeshLambertMaterial({ color: 0x9fc2ff, emissive: 0x1d3c8a, transparent: true, opacity: 0.85 }));
      icon.rotation.x = PI / 2;
    } else {
      icon = new T.Group();
      const n = new T.Mesh(new T.CylinderGeometry(0.16, 0.3, 0.46, 12, 1, true), L(0xdfe3e6, 0x222222));
      const f = new T.Mesh(new T.ConeGeometry(0.22, 0.6, 10), new T.MeshBasicMaterial({ color: 0xffc72c }));
      f.rotation.x = PI;
      f.position.y = -0.5;
      icon.add(n, f);
    }
    g.add(icon);
    return { group: g, ring, icon };
  };
})();
