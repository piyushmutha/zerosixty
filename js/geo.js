/* Zero Sixty: geometry helpers and procedural textures. Nothing here is loaded from disk. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE;
  const G = (EZ.Geo = {});

  const _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();

  G.mat4 = function (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    return new T.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  };

  // A piece for G.merge: geometry, flat colour, placement.
  G.part = (g, c, x, y, z, rx, ry, rz, sx, sy, sz) => ({ g, c, m: G.mat4(x, y, z, rx, ry, rz, sx, sy, sz) });

  // Merge many small pieces into one non-indexed geometry with per-vertex colour.
  // A null colour keeps the piece's own colour attribute.
  G.merge = function (parts) {
    const list = [];
    let n = 0;
    for (const p of parts) {
      const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (p.m) g.applyMatrix4(p.m);
      list.push([g, p.c]);
      n += g.attributes.position.count;
    }
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = new T.Color();
    let o = 0;
    for (const [g, hex] of list) {
      const cnt = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      const own = g.attributes.color;
      if (hex == null && own) {
        col.set(own.array, o * 3);
      } else {
        c.set(hex == null ? 0xffffff : hex);
        for (let i = 0; i < cnt; i++) {
          col[(o + i) * 3] = c.r;
          col[(o + i) * 3 + 1] = c.g;
          col[(o + i) * 3 + 2] = c.b;
        }
      }
      o += cnt;
      g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  };

  // Box whose top face can be smaller and shifted: car cabins, hoods, roof caps.
  G.taperBox = function (w, h, d, tw, td, tz = 0, tx = 0) {
    const hw = w / 2, hd = d / 2, hy = h / 2, tw2 = tw / 2, td2 = td / 2;
    const v = [
      [-hw, -hy, -hd], [hw, -hy, -hd], [hw, -hy, hd], [-hw, -hy, hd],
      [-tw2 + tx, hy, -td2 + tz], [tw2 + tx, hy, -td2 + tz], [tw2 + tx, hy, td2 + tz], [-tw2 + tx, hy, td2 + tz],
    ];
    const f = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
    const pos = new Float32Array(f.length * 3);
    f.forEach((idx, i) => pos.set(v[idx], i * 3));
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };

  G.box = (w, h, d) => new T.BoxGeometry(w, h, d);
  G.cyl = (rt, rb, h, seg = 12, open = false) => new T.CylinderGeometry(rt, rb, h, seg, 1, open);

  // A thin box stretched between two points.
  G.beam = function (a, b, t, color) {
    const d = new T.Vector3().subVectors(b, a);
    const len = d.length();
    const g = new T.BoxGeometry(t, t, len);
    const m = new T.Matrix4().lookAt(new T.Vector3(0, 0, 0), d, new T.Vector3(0, 1, 0));
    m.setPosition(new T.Vector3().addVectors(a, b).multiplyScalar(0.5));
    return { g, c: color, m };
  };

  // Move every vertex through fn(Vector3).
  G.warp = function (geo, fn) {
    const p = geo.attributes.position, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      fn(v);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    p.needsUpdate = true;
    return geo;
  };

  // Smooth normals across shallow edges, keep hard creases sharp.
  G.creased = function (geo, angle) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, n = pos.count, cosA = Math.cos(angle);
    const faceN = new Float32Array(n * 3);
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      c.sub(b); a.sub(b); c.cross(a);
      const len = c.length() || 1;
      for (let k = 0; k < 3; k++) {
        faceN[(i + k) * 3] = c.x / len;
        faceN[(i + k) * 3 + 1] = c.y / len;
        faceN[(i + k) * 3 + 2] = c.z / len;
      }
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
      let l = groups.get(k);
      if (!l) groups.set(k, (l = []));
      l.push(i);
    }
    const out = new Float32Array(n * 3);
    for (const l of groups.values()) {
      for (const i of l) {
        let x = 0, y = 0, z = 0;
        for (const j of l) {
          const d = faceN[i * 3] * faceN[j * 3] + faceN[i * 3 + 1] * faceN[j * 3 + 1] + faceN[i * 3 + 2] * faceN[j * 3 + 2];
          if (d >= cosA) { x += faceN[j * 3]; y += faceN[j * 3 + 1]; z += faceN[j * 3 + 2]; }
        }
        const L = Math.hypot(x, y, z) || 1;
        out[i * 3] = x / L; out[i * 3 + 1] = y / L; out[i * 3 + 2] = z / L;
      }
    }
    g.setAttribute('normal', new T.BufferAttribute(out, 3));
    return g;
  };

  // ---------------------------------------------------------------- textures
  G.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  G.roundRect = function (c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

  G.glowTexture = function () {
    const cv = G.canvas(128, 128), c = cv.getContext('2d');
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(cv);
  };

  G.blobTexture = function () {
    const cv = G.canvas(128, 128), c = cv.getContext('2d');
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.62)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.38)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(cv);
  };

  G.smokeTexture = function () {
    const cv = G.canvas(64, 64), c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(cv);
  };

  // One 12 m slice of the three-lane, one-way carriageway, repeated along its length.
  // Spans x = ROAD_L (narrow left shoulder) to x = ROAD_R (full right shoulder).
  G.ROAD_X0 = EZ.C.ROAD_L;
  G.ROAD_X1 = EZ.C.ROAD_R;
  G.roadTexture = function (renderer) {
    const W = 512, H = 512, cv = G.canvas(W, H), c = cv.getContext('2d');
    const X0 = G.ROAD_X0, X1 = G.ROAD_X1, pxm = W / (X1 - X0), pym = H / 12;
    const px = (x) => (x - X0) * pxm;
    const E = EZ.C.EDGE;
    c.fillStyle = '#3d4146';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#4a4d51';
    c.fillRect(px(E + 0.15), 0, W - px(E + 0.15), H);
    c.fillRect(0, 0, px(-E - 0.15), H);
    for (let i = 0; i < 11000; i++) {
      const v = (46 + Math.random() * 46) | 0;
      c.fillStyle = `rgba(${v},${v + 2},${v + 5},${(Math.random() * 0.5 + 0.25).toFixed(2)})`;
      c.fillRect(Math.random() * W, Math.random() * H, 1.3, 1.3);
    }
    // polished wheel tracks
    c.fillStyle = 'rgba(22,24,27,0.18)';
    for (const l of EZ.LANES) {
      const cx = EZ.laneX(l);
      for (const o of [-0.82, 0.82]) c.fillRect(px(cx + o - 0.3), 0, 0.6 * pxm, H);
    }
    // a patched seam
    c.fillStyle = 'rgba(20,21,23,0.35)';
    c.fillRect(px(-E), H * 0.62, px(E) - px(-E), 2);
    // 10 ft dashes, 30 ft gaps
    c.fillStyle = '#EDEEE9';
    for (const lx of [-1.8, 1.8]) c.fillRect(px(lx) - 0.08 * pxm, 0, 0.16 * pxm, 3.05 * pym);
    // one-way road: yellow line on the left edge, white on the right
    c.fillStyle = '#E2B33A';
    c.fillRect(px(-E - 0.1) - 0.08 * pxm, 0, 0.16 * pxm, H);
    c.fillStyle = '#EDEEE9';
    c.fillRect(px(E + 0.1) - 0.08 * pxm, 0, 0.16 * pxm, H);
    // rumble strips on both shoulders
    c.fillStyle = 'rgba(16,17,19,0.55)';
    for (let y = 0; y < H; y += 0.6 * pym) {
      c.fillRect(px(E + 0.65), y, 0.45 * pxm, 0.27 * pym);
      c.fillRect(px(-E - 1.0), y, 0.4 * pxm, 0.27 * pym);
    }
    const t = new T.CanvasTexture(cv);
    t.wrapS = T.ClampToEdgeWrapping;
    t.wrapT = T.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };

  // Wireless charging lane: inductive pads and chevrons, drawn as light on black so it can be
  // added over the asphalt. One repeat is 4 m of lane.
  G.stripTexture = function () {
    const cv = G.canvas(128, 256), c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, 128, 256);
    c.fillStyle = 'rgba(60,190,255,0.55)';
    c.fillRect(2, 0, 7, 256); c.fillRect(119, 0, 7, 256);
    c.strokeStyle = 'rgba(70,200,255,0.85)'; c.lineWidth = 5;
    G.roundRect(c, 20, 18, 88, 88, 18); c.stroke();
    c.lineWidth = 3;
    for (const r of [28, 17]) { c.beginPath(); c.arc(64, 62, r, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = 'rgba(130,255,225,1)'; c.lineWidth = 11; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(30, 222); c.lineTo(64, 176); c.lineTo(98, 222); c.stroke();
    const t = new T.CanvasTexture(cv);
    t.wrapT = T.RepeatWrapping;
    return t;
  };

  // Office-tower facade: 4 windows across, 8 floors up per repeat.
  G.windowTextures = function () {
    const W = 128, H = 256;
    const day = G.canvas(W, H), d = day.getContext('2d');
    const lit = G.canvas(W, H), l = lit.getContext('2d');
    d.fillStyle = '#d9d8d3'; d.fillRect(0, 0, W, H);
    l.fillStyle = '#000'; l.fillRect(0, 0, W, H);
    const cw = W / 4, ch = H / 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const gx = x * cw + 4, gy = y * ch + 6, gw = cw - 8, gh = ch - 11;
        const shade = 70 + Math.random() * 40;
        d.fillStyle = `rgb(${shade * 0.8 | 0},${shade * 0.9 | 0},${shade | 0})`;
        d.fillRect(gx, gy, gw, gh);
        if (Math.random() < 0.34) {
          const warm = Math.random() < 0.7;
          l.fillStyle = warm ? `rgba(255,${200 + Math.random() * 30 | 0},${130 + Math.random() * 50 | 0},1)` : 'rgba(190,215,255,1)';
          l.fillRect(gx, gy, gw, gh);
        }
      }
    }
    const a = new T.CanvasTexture(day), b = new T.CanvasTexture(lit);
    for (const t of [a, b]) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return { day: a, lit: b };
  };

  // Licence plate on the Roadster's tail. The SpaceX-style thrusters hide behind it.
  G.plateTexture = function () {
    const cv = G.canvas(256, 80), c = cv.getContext('2d');
    c.fillStyle = '#f4f4ef'; G.roundRect(c, 0, 0, 256, 80, 10); c.fill();
    c.strokeStyle = '#1d2a5c'; c.lineWidth = 4; G.roundRect(c, 5, 5, 246, 70, 8); c.stroke();
    c.fillStyle = '#c8102e'; c.font = '600 14px Overpass, Arial, sans-serif'; c.textAlign = 'center';
    c.fillText('California', 128, 22);
    c.fillStyle = '#1d2a5c'; c.font = '800 44px Overpass, Arial, sans-serif';
    c.fillText('0TO60', 128, 66);
    return new T.CanvasTexture(cv);
  };
})();
