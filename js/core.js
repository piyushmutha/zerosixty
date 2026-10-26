/* Zero Sixty: shared helpers, tuning constants, the places you drive through, and save data. */
(function () {
  'use strict';
  const EZ = (window.EZ = window.EZ || {});

  // ---------------------------------------------------------------- math
  EZ.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  EZ.lerp = (a, b, t) => a + (b - a) * t;
  EZ.damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  EZ.smoothstep = (a, b, v) => {
    const t = EZ.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  EZ.rand = (a, b) => a + Math.random() * (b - a);
  EZ.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  EZ.chance = (p) => Math.random() < p;
  EZ.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  EZ.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  EZ.weighted = (pairs) => {
    let sum = 0;
    for (const p of pairs) sum += Math.max(0, p[1]);
    let r = Math.random() * sum;
    for (const p of pairs) { r -= Math.max(0, p[1]); if (r <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  };
  // small seeded generator so scenery at a given spot is always the same
  EZ.rng = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------------------------------------------------------------- tuning
  EZ.C = {
    LANES: 3,
    LANE_W: 3.6,
    EDGE: 5.4, // outer edge of the outside lanes
    ROAD_L: -6.9, // asphalt: a narrow left shoulder...
    ROAD_R: 8.4, // ...and a full-width right shoulder
    VIEW: 330, // static hazards appear this far ahead (m)
    TRAFFIC_VIEW: 250, // moving traffic appears this far ahead (m)
    HORIZON: 720, // the planner lays out the road this far ahead
    BEHIND: 70, // things are recycled once this far behind
    BIOME_LEN: 2200,
    GAP_MAX: 46, // metres between your bumper and the lead cruiser at best
    STUMBLE_GAP: 24,
    BUMPER: 12, // metres: inside this the lead cruiser is on your bumper, and the next hit ends the run
    MILE: 1609.344,
    P_HW: 0.93, // player half width
    P_HL: 2.15, // player half length
    TOP: 1.2, // roof height
    TOP_LOW: 1.07, // roof height on lowered air suspension
    BOTTOM: 0.14,
    CLEAR: 1.15, // underside of trailers and low-clearance bars
    HOP_V: 9.6,
    ROLL_V: 11.5, // a barrel roll throws the car higher than a hop, enough to clear a car
    GRAVITY: 30,
    LAUNCH_ACCEL: 33, // m/s^2 with the rear thrusters lit: 0-60 mph in about 0.81 s
    BOOST_TIME: 3.8, // seconds a Launch lasts; it eases off over the last 1.2 s
    SIXTY: 26.82, // m/s: 60 mph, the launch target and the slowest the car goes while the battery holds
    TUBE_R: 3.8, // radius of the suction tube
    TUBE_CLIMB: 36, // metres spent climbing the wall
    TUBE_CEIL: 70, // metres driven upside down on the ceiling
  };
  // traffic speed as a share of yours, per lane: the left lane is the fast lane
  EZ.LANE_K = [0.26, 0.19, 0.12];
  EZ.LANES = [0, 1, 2];
  EZ.laneX = (i) => (i - 1) * EZ.C.LANE_W;
  EZ.laneOf = (x) => EZ.clamp(Math.round(x / EZ.C.LANE_W + 1), 0, EZ.C.LANES - 1);

  // ---------------------------------------------------------------- places
  EZ.BIOMES = [
    {
      key: 'pacific', name: 'the Pacific coast', place: 'Highway 1 near Big Sur', short: 'Big Sur',
      sky: { top: '#4C7FAE', horizon: '#F6CB98', bottom: '#D8A277', sun: '#FFF1C9', dir: [0.62, 0.16, -1], size: 0.05, glow: 0.7 },
      fog: { color: '#EFC596', near: 80, far: 380 },
      light: { sky: '#FFE9CC', ground: '#7A5F44', hemi: 0.82, dir: '#FFD9A6', dirI: 1.05 },
      night: 0,
      layers: ['#C99D82', '#A57D6F'],
      signs: [['Big Sur', '14'], ['Monterey', '41'], ['Hawthorne', '298'], ['Carmel', '27'], ['San Simeon', '62']],
    },
    {
      key: 'mojave', name: 'the Mojave', place: 'I-15 outside Baker', short: 'Baker',
      sky: { top: '#2E3A63', horizon: '#EE9E7C', bottom: '#B97563', sun: '#FFC59E', dir: [-0.7, 0.035, -1], size: 0.07, glow: 0.9 },
      fog: { color: '#D49181', near: 70, far: 360 },
      light: { sky: '#F3B79A', ground: '#5C3E36', hemi: 0.68, dir: '#FF9F78', dirI: 0.72 },
      night: 0.42,
      layers: ['#A0656A', '#704859'],
      signs: [['Baker', '23'], ['Las Vegas', '94'], ['Mars', '140,000,000'], ['Barstow', '61'], ['Zzyzx Rd', '7']],
    },
    {
      key: 'downtown', name: 'downtown', place: 'the 110 through downtown', short: 'downtown',
      sky: { top: '#0B1533', horizon: '#4B3F55', bottom: '#2A2633', sun: '#DCE4FF', dir: [0.3, 0.42, -1], size: 0.018, glow: 0.25 },
      fog: { color: '#2A2A3D', near: 60, far: 330 },
      light: { sky: '#6476AB', ground: '#2B2522', hemi: 0.55, dir: '#A3B5EC', dirI: 0.38 },
      night: 1,
      layers: ['#1D2033', '#2A2C45'],
      signs: [['Downtown', '2'], ['Hawthorne', '9'], ['Fremont', '372'], ['Civic Center', '1'], ['Harbor Fwy', '4']],
    },
    {
      key: 'sierra', name: 'the Sierra Nevada', place: 'I-80 over Donner Pass', short: 'Donner Pass',
      sky: { top: '#7FA6CC', horizon: '#F3DCCB', bottom: '#B9C2C4', sun: '#FFF4E0', dir: [-0.5, 0.11, -1], size: 0.045, glow: 0.6 },
      fog: { color: '#D7DCDB', near: 45, far: 280 },
      light: { sky: '#E3EBF2', ground: '#3E4A3A', hemi: 0.82, dir: '#FFE8D2', dirI: 0.85 },
      night: 0.12,
      layers: ['#A3AFB9', '#7C8C9F'],
      signs: [['Donner Pass', '8'], ['Reno', '46'], ['Truckee', '12'], ['Starbase', '1,640'], ['Lake Tahoe', '19']],
    },
  ];
  EZ.biomeIndex = (s) => {
    const n = EZ.BIOMES.length;
    return ((Math.floor(s / EZ.C.BIOME_LEN) % n) + n) % n;
  };

  // ---------------------------------------------------------------- paint
  EZ.PAINTS = [
    { id: 'ano', call: 'white', name: 'Ano white', color: '#EEF0EB', metal: 0.18, rough: 0.2, unlock: 0 },
    { id: 'red', call: 'red', name: 'Red multi-coat', color: '#B0101E', metal: 0.45, rough: 0.28, unlock: 0 },
    { id: 'white', call: 'white', name: 'Pearl white', color: '#E8EBEC', metal: 0.12, rough: 0.24, unlock: 0 },
    { id: 'black', call: 'black', name: 'Obsidian black', color: '#131518', metal: 0.5, rough: 0.2, unlock: 2 },
    { id: 'silver', call: 'grey', name: 'Midnight silver', color: '#5A5F66', metal: 0.72, rough: 0.28, unlock: 5 },
    { id: 'blue', call: 'blue', name: 'Deep ocean blue', color: '#1D3C8A', metal: 0.6, rough: 0.24, unlock: 10 },
    { id: 'quick', call: 'silver', name: 'Liquid silver', color: '#BFC3C7', metal: 0.96, rough: 0.12, unlock: 20 },
    { id: 'matte', call: 'black', name: 'Stealth matte', color: '#2A2E32', metal: 0.25, rough: 0.78, unlock: 35 },
  ];
  EZ.paintById = (id) => EZ.PAINTS.find((p) => p.id === id) || EZ.PAINTS[0];

  // ---------------------------------------------------------------- save data
  const KEY = 'zero-sixty/save/1', OLD_KEY = 'exit-zero/save/1'; // the game was called Exit Zero before
  EZ.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  EZ.touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  // recording mode (?record in the URL): no first-run hints, and the pause menu picks the next set piece
  EZ.record = new URLSearchParams(location.search).has('record');
  const DEFAULTS = {
    best: 0,
    bestDist: 0,
    totalDist: 0,
    runs: 0,
    paint: 'ano',
    tutorial: false,
    controlsSeen: false, // the first-run controls strip has done its job
    settings: { sound: true, volume: 0.8, music: 0.7, quality: 'auto', mirror: true, shake: !EZ.reduceMotion, haptics: true, units: 'mph' },
  };
  EZ.store = {
    data: null,
    load() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY)); } catch (e) { raw = null; }
      const d = JSON.parse(JSON.stringify(DEFAULTS));
      if (raw && typeof raw === 'object') {
        Object.assign(d, raw);
        d.settings = Object.assign({}, DEFAULTS.settings, raw.settings || {});
      }
      this.data = d;
      return d;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode: progress lasts this session */ }
    },
  };
  EZ.store.load();

  // ---------------------------------------------------------------- formatting
  const metric = () => EZ.store.data.settings.units === 'kmh';
  EZ.fmt = {
    int: (n) => Math.round(n).toLocaleString('en-US'),
    dist: (m) => (metric() ? m / 1000 : m / EZ.C.MILE).toFixed(1),
    distUnit: () => (metric() ? 'km' : 'mi'),
    markerLabel: () => (metric() ? 'Km' : 'Mile'),
    speed: (ms) => Math.round(metric() ? ms * 3.6 : ms * 2.23694),
    speedUnit: () => (metric() ? 'km/h' : 'mph'),
    near: (m) => (metric() ? `${Math.max(0, Math.round(m))} m` : `${Math.max(0, Math.round(m * 3.281))} ft`),
    limit: () => (metric() ? '100 km/h' : '65 mph'),
    time: (sec) => {
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    },
  };
})();
