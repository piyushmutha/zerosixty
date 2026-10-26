/* Zero Sixty: the game loop, states, collisions, camera, rear-view mirror and the citation. */
(function () {
  'use strict';
  const EZ = window.EZ, T = THREE, C = EZ.C, G = EZ.Geo;
  const PI = Math.PI;
  const LAUNCH_AT = 0.75; // seconds on the line before the thrusters fire

  const LINES = {
    start: [['Dispatch', 'All units: {color} Roadster on {road}. Driver will not stop.'], ['Unit 7', "In pursuit. It did zero to sixty before I found my radio."]],
    hop: [['Unit 7', 'Did that car just jump?'], ['Unit 12', 'Suspect cleared the barrier. With thrusters, apparently.'], ['Air 1', 'Confirming: the car was airborne.']],
    duck: [['Unit 3', 'It went under. Under the truck.'], ['Unit 7', 'It dropped its suspension and slid right under.']],
    near: [['Unit 12', 'Suspect threading traffic at {speed}.'], ['Dispatch', 'Callers report a {color} blur between the lanes.']],
    stumble: [['Unit 7', "Contact! We're on its bumper."], ['Unit 4', 'It clipped something. Closing in.']],
    close: [['Unit 7', 'Two car lengths. Box it in.'], ['Unit 4', 'Right behind it. Stay on it.']],
    wreck: [['Unit 9', "Unit down. I'm fine. The cruiser isn't."], ['Dispatch', "That's another cruiser in the ditch. Ease off the PIT."]],
    roadblock: [['Dispatch', 'Roadblock is set ahead. Leave it nowhere to go.'], ['Unit 2', 'Units in position at the block.']],
    pit: [['Unit 4', 'Moving up on the {side}. Going for the PIT.'], ['Unit 9', "I've got the {side} side. Lining up."]],
    heli: [['Air 1', 'Air unit on scene. Lighting it up.'], ['Air 1', 'Spotlight is on the suspect.']],
    battery: [['Unit 7', "It's slowing down. Battery must be dying."], ['Dispatch', 'Suspect is running low on charge. Stay with it.']],
    jammer: [['Unit 7', 'Lost it on radar. Where did it go?'], ['Dispatch', 'All units, our scopes are full of static.']],
    hover: [['Air 1', "It's flying. I'm putting that in the report."], ['Unit 12', 'Suspect is hovering. Repeat, hovering.']],
    boost: [['Unit 7', 'It just doubled its speed. How?'], ['Unit 4', 'Lost it again. That launch is unreal.']],
    biome: [['Dispatch', 'Suspect is heading into {place}. All units.'], ['Dispatch', 'Pursuit moving through {place}.']],
    spikes: [['Unit 2', "Spikes got it! It's still going?"], ['Unit 2', 'Tyres are shredding. Keep the pressure on.']],
    crash: [['Unit 7', 'Suspect is stopped. Moving in.'], ['Dispatch', 'Vehicle disabled. All units converge.']],
    caught: [['Unit 7', 'Boxed in. Suspect is stopped.'], ['Unit 4', 'Pinned. Driver, stay in the vehicle.']],
    shield: [['Unit 12', 'It bounced off like it was nothing.']],
    roll: [['Unit 12', 'It barrel-rolled over a car. Sideways. On purpose.'], ['Unit 7', 'It just flipped across two lanes and kept going.']],
    tube: [['Air 1', "It's driving up the wall. Now it's on the ceiling."], ['Unit 4', 'How is it not falling off? Those fans, maybe.']],
    landed: [['Air 1', 'Thrusters flipped it upright. It set down like a rocket.'], ['Unit 7', 'It landed in a cloud of smoke and kept going.']],
    launch: [['Unit 7', 'Zero to sixty in under a second. We are not catching that.'], ['Dispatch', 'Rear thrusters lit. Suspect is gone.']],
    rolling: [['Dispatch', 'Rolling block in place. Three units abreast.'], ['Unit 2', 'We have every lane. It has nowhere to go.']],
    rollingBroken: [['Unit 2', 'It rolled right over us. Over the roof.'], ['Dispatch', 'Rolling block failed. Regroup.']],
    toll: [['Dispatch', 'Suspect ran the toll plaza. Add it to the list.'], ['Unit 9', 'It went through without paying. Naturally.']],
    cargo: [['Unit 4', 'That flatbed is losing its load all over the road!'], ['Dispatch', 'Debris on the roadway. Use caution.']],
    wind: [['Dispatch', 'High wind advisory on this stretch.'], ['Unit 7', 'Gusts are throwing us all over the lane.']],
    drones: [['Dispatch', 'Drone unit launched. EMP mines authorized.'], ['Drone 1', 'Target acquired. Deploying.']],
    emp: [['Drone 1', 'Direct hit. Its thrusters are down.'], ['Unit 7', 'EMP got it. Close in now.']],
    carrier: [['Unit 12', 'It drove up the car carrier and jumped the cab.'], ['Air 1', 'It used the transporter as a ramp. Unbelievable.']],
    charging: [['Dispatch', 'Suspect is in the charging lane, topping up.'], ['Unit 4', 'It is charging off the road itself. That is not fair.']],
  };
  const COOLDOWN = { near: 20, hop: 18, duck: 18, stumble: 8, close: 15, pit: 6, biome: 5, battery: 25, boost: 20, roll: 16, landed: 10 };
  const CHARGES = {
    caught: 'Failure to yield to emergency vehicles',
    battery: 'Evading arrest on an empty battery',
    car: 'Rear-ended a civilian while evading arrest',
    cruiser: 'Rammed a police vehicle',
    pit: 'Rammed a police vehicle',
    roadblock: 'Ran a police roadblock',
    barrier: 'Struck a highway barrier at speed',
    lowbar: 'Failed to clear a low-clearance bar',
    trailer: 'Drove into a jackknifed trailer',
    axles: 'Drove into a jackknifed trailer',
    tractor: 'Drove into a jackknifed truck',
    arrowL: 'Struck a road works arrow board',
    arrowR: 'Struck a road works arrow board',
    booth: 'Drove into a toll booth',
    gate: 'Crashed through a toll gate',
    cargo: 'Struck spilled cargo at speed',
    carrier: 'Rear-ended a car carrier',
    flatbed: 'Rear-ended a flatbed truck',
  };
  const OFFICERS = ['Ramirez', 'Okafor', 'Lindqvist', 'Patel', 'Brennan', 'Nakamura', 'Duarte', 'Kowalski', 'Achebe', 'Moreau'];

  class Game {
    constructor() {
      const canvas = document.getElementById('gl');
      this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setClearColor(0x22262a);
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(58, 1, 0.1, 1500);
      this.mirrorCam = new T.PerspectiveCamera(34, 3, 0.4, 320);
      this.mirrorRT = new T.WebGLRenderTarget(400, 120);
      this.overlay = new T.Scene();
      this.ortho = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quad = new T.PlaneGeometry(2, 2);
      const uv = quad.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      this.overlay.add(new T.Mesh(quad, new T.MeshBasicMaterial({ map: this.mirrorRT.texture, depthTest: false, depthWrite: false })));

      this.envMap = this.makeEnv(EZ.BIOMES[0]);
      this.envKey = 'pacific';
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.autoScale = 1;
      this.world = new EZ.World(this);
      this.ents = new EZ.Entities(this);
      this.player = new EZ.Player(this);
      this.police = new EZ.Police(this);
      this.fx = new EZ.FX(this);
      EZ.UI.init(this);
      EZ.Input.init(this);
      this.ch = new EZ.Challenges(this);

      this.state = 'title';
      this.time = 0;
      this.frame = 0;
      this.shake = 0;
      this.mirrorEvery = EZ.touch ? 2 : 1;
      this.perf = { t: 0, n: 0, windows: 0 };
      this.run = this.newRun();
      this.flashColor = '';
      this.titleCop = -1;
      this.camLook = new T.Vector3();

      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.inRun()) this.pause();
          EZ.Audio.silence();
          EZ.Audio.suspend();
        } else {
          EZ.Audio.resume();
        }
      });
      // music starts with the first touch, click or key press
      const unlock = () => EZ.Audio.unlock();
      window.addEventListener('pointerdown', unlock, { once: true, capture: true });
      window.addEventListener('keydown', unlock, { once: true, capture: true });
      this.resize();
      this.titleSetup();
      this.updateCamera(0.016);
      this.world.update(0, 0.016, this.camera);
      try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* compile lazily */ }
      this.loop = this.loop.bind(this);
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }

    // ---------------------------------------------------------------- environment reflections
    makeEnv(b) {
      const cv = G.canvas(256, 128), c = cv.getContext('2d');
      const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, b.sky.top);
      g.addColorStop(0.4, b.sky.horizon);
      g.addColorStop(0.49, b.fog.color);
      g.addColorStop(0.52, '#3c3833');
      g.addColorStop(1, '#141414');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 128);
      const d = new T.Vector3(...b.sky.dir).normalize();
      const u = Math.atan2(d.z, d.x) / (2 * PI) + 0.5, v = Math.asin(d.y) / PI + 0.5;
      const sx = u * 256, sy = (1 - v) * 128;
      const rg = c.createRadialGradient(sx, sy, 0, sx, sy, 26);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.3, b.sky.sun);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, 256, 128);
      // soft light strips: they give the paint long, readable highlights
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.fillRect(0, 30, 256, 5);
      c.fillRect(0, 44, 256, 2);
      const tex = new T.CanvasTexture(cv);
      tex.mapping = T.EquirectangularReflectionMapping;
      return tex;
    }
    updateEnv(key) {
      if (!key || key === this.envKey) return;
      const old = this.envMap;
      this.envMap = this.makeEnv(EZ.BIOMES.find((b) => b.key === key));
      this.player.model.setEnv(this.envMap);
      this.envKey = key;
      if (old) setTimeout(() => old.dispose(), 500);
    }

    // ---------------------------------------------------------------- sizing and quality
    resize() {
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.aspect = this.w / this.h;
      this.applyQuality();
      this.renderer.setSize(this.w, this.h);
      this.camera.aspect = this.aspect;
      this.camera.updateProjectionMatrix();
      if (this.fx) this.fx.setScale(this.h * this.renderer.getPixelRatio(), this.camera.fov);
      this.measureMirror();
    }
    applyQuality() {
      const q = EZ.store.data.settings.quality, dpr = window.devicePixelRatio || 1;
      let pr;
      if (q === 'high') pr = Math.min(dpr, 2);
      else if (q === 'low') pr = Math.min(dpr, 1) * 0.8;
      else pr = Math.min(dpr, EZ.touch ? 1.6 : 2) * this.autoScale;
      this.renderer.setPixelRatio(Math.max(0.6, pr));
    }
    applySettings() {
      this.resize();
      EZ.UI.el.mirror.hidden = !EZ.store.data.settings.mirror;
      this.measureMirror();
    }
    measureMirror() {
      const el = EZ.UI && EZ.UI.el && EZ.UI.el.mirrorGlass;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) { this.mirrorRect = null; return; }
      this.mirrorRect = { x: r.left, y: this.h - r.bottom, w: r.width, h: r.height };
      const pr = this.renderer.getPixelRatio();
      this.mirrorRT.setSize(Math.min(720, Math.round(r.width * pr)), Math.min(260, Math.round(r.height * pr)));
      this.mirrorCam.aspect = r.width / r.height;
      this.mirrorCam.updateProjectionMatrix();
    }
    mirrorOn() {
      return EZ.store.data.settings.mirror && this.mirrorRect && (this.state === 'run' || this.state === 'intro' || this.state === 'paused');
    }
    perfCheck(dt) {
      if (this.state !== 'run' || EZ.store.data.settings.quality !== 'auto') return;
      const P = this.perf;
      P.t += dt; P.n++;
      if (P.t < 3) return;
      const fps = P.n / P.t;
      P.t = 0; P.n = 0; P.windows++;
      if (P.windows < 2) return;
      if (fps < 43 && this.autoScale > 0.55) {
        this.autoScale *= 0.8;
        this.mirrorEvery = 2;
        this.resize();
      }
    }

    // ---------------------------------------------------------------- states
    inRun() { return this.state === 'run' || this.state === 'intro'; }
    newRun() {
      return {
        time: 0, score: 0, volts: 0, near: 0, wrecks: 0, top: 0, combo: 0, comboT: 0, mult: 1, gap: 9,
        voltStep: 0, voltT: 0, biome: '', said: {}, lastSay: -99, reason: '', hitKind: null, nearChain: 0,
      };
    }
    titleSetup() {
      const p = this.player;
      p.reset();
      p.setPaint(EZ.store.data.paint);
      this.police.reset();
      this.releaseTitleCop();
      const pool = this.ents.pools.cruiser;
      this.titleCop = pool.alloc();
      if (this.titleCop >= 0) pool.set(this.titleCop, EZ.laneX(1) - 0.5, 0, 11.5, 0.12, 0, 0, 1);
      this.run = this.newRun();
      this.run.gap = 30;
    }
    releaseTitleCop() {
      if (this.titleCop >= 0) { this.ents.pools.cruiser.release(this.titleCop); this.titleCop = -1; }
    }
    startRun() {
      EZ.Audio.unlock();
      this.slow = null;
      EZ.Audio.applySettings();
      this.releaseTitleCop();
      this.police.clearExtra();
      this.world.reset();
      this.ents.reset();
      this.player.reset();
      this.police.reset();
      this.fx.reset();
      this.ch.reset();
      this.player.setPaint(EZ.store.data.paint);
      this.run = this.newRun();
      this.state = 'intro';
      this.introT = 0;
      this.launchCam = null;
      this.camFrom = this.camera.position.clone();
      this.lookFrom = this.camLook.clone();
      EZ.UI.screen(null);
      EZ.UI.showHud(true);
      this.measureMirror();
      this.police.startChase();
      // first runs: the controls sit under the car until you've tried each one
      this.quick = !EZ.store.data.controlsSeen;
      EZ.UI.quickstart(this.quick);
      this.perf = { t: 0, n: 0, windows: 0 };
      EZ.store.data.runs++;
    }
    toTitle() {
      this.slow = null;
      this.police.clearExtra();
      this.world.reset();
      this.ents.reset();
      this.fx.reset();
      this.ch.reset();
      this.titleSetup();
      this.state = 'title';
      EZ.UI.showHud(false);
      EZ.UI.screen('title');
      EZ.Audio.silence();
    }
    openPaint() {
      this.state = 'paint';
      EZ.UI.screen('paint');
    }
    pause() {
      if (!this.inRun()) return;
      this.resumeTo = this.state;
      this.state = 'paused';
      EZ.UI.screen('pause');
      EZ.Audio.silence();
    }
    resume() {
      if (this.state !== 'paused') return;
      this.state = this.resumeTo || 'run';
      EZ.UI.screen(null);
      this.last = performance.now();
    }

    // ---------------------------------------------------------------- input
    action(a, src) {
      EZ.Audio.resume();
      if (EZ.UI.settingsOpen()) { if (a === 'pause') EZ.UI.closeSettings(); return; }
      const confirm = a === 'confirm' || (src === 'pad' && a === 'hop');
      switch (this.state) {
        case 'title': if (confirm) this.startRun(); break;
        case 'citation':
          if (confirm && this.citeT > 0.7) this.startRun();
          else if (a === 'pause') this.toTitle();
          break;
        case 'paint': if (a === 'pause' || confirm) this.toTitle(); break;
        case 'paused': if (a === 'pause' || confirm) this.resume(); break;
        case 'intro': if (a === 'pause') this.pause(); break;
        case 'run': this.drive(a, src); break;
      }
    }
    drive(a, src) {
      const p = this.player;
      if (a === 'left' || a === 'right') { p[a](); this.learned('steer'); }
      else if (a === 'hop') {
        this.learned('hop');
        const r = p.hop();
        if (r === 'hop') this.onHop();
        else if (r === 'empty') { EZ.Audio.fizzle(); EZ.UI.pop('Thrusters recharging', 'info'); }
        else if (r === 'emp') { EZ.Audio.fizzle(); EZ.UI.pop('Thrusters offline', 'bad'); }
      } else if (a === 'duck') {
        this.learned('low');
        const r = p.duck(src === 'key' || src === 'pad');
        if (r === 'low' || r === 'slam') EZ.Audio.lower();
      } else if (a === 'duckUp') p.releaseDuck();
      else if (a === 'rollL' || a === 'rollR') {
        this.learned('roll');
        const r = p.barrelRoll(a === 'rollL' ? -1 : 1);
        if (r === 'roll') this.onRoll();
        else if (r === 'empty') { EZ.Audio.fizzle(); EZ.UI.pop('Air tanks refilling', 'info'); }
        else if (r === 'emp') { EZ.Audio.fizzle(); EZ.UI.pop('Thrusters offline', 'bad'); }
      }
      else if (a === 'boost') {
        if (p.fireBoost()) this.onBoost();
        else if (p.boosting > 0 || p.crashed) { /* already launching */ }
        else if (p.emp > 0) { EZ.Audio.fizzle(); EZ.UI.pop('Thrusters offline', 'bad'); }
        else {
          // the diamond isn't full yet: say so rather than doing nothing
          EZ.Audio.fizzle();
          EZ.UI.pop(`Launch charging ${Math.floor(p.boost * 100)}%`, 'info');
          EZ.UI.denyLaunch();
        }
      }
      else if (a === 'pause') this.pause();
    }
    onHop() {
      const p = this.player;
      EZ.Audio.hop();
      this.fx.vapor(p.x, 0.25, -p.s, 0, -4, -p.speed * 0.25, 12);
      this.vibrate(18);
    }
    onRoll() {
      const p = this.player;
      EZ.Audio.roll();
      this.fx.vapor(p.x, 0.3, -p.s, -p.stunt.dir * 6, -2, -p.speed * 0.25, 14);
      this.vibrate(24);
    }
    onLand(impact, soft, rolled) {
      const p = this.player, r = this.run;
      if (this.state !== 'run') return;
      EZ.Audio.land(soft ? 2 : impact);
      if (soft) {
        // touchdown on thrusters: a ring of smoke, no jolt
        this.fx.dust(p.x, -p.s, -p.speed * 0.2, 22);
        this.fx.vapor(p.x, 0.2, -p.s, 0, -1, -p.speed * 0.3, 16);
        EZ.UI.pop('Thruster landing', 'trick');
      } else {
        this.fx.dust(p.x, -p.s, -p.speed * 0.2, Math.min(14, 4 + impact));
        this.shake = Math.max(this.shake, Math.min(0.35, impact * 0.02));
      }
      if (p.carrierJump) {
        p.carrierJump = false;
        this.addCombo(3);
        const pts = Math.round(350 * r.mult);
        r.score += pts;
        p.boost = Math.min(1, p.boost + 0.25);
        EZ.UI.pop(`Carrier jump +${pts}`, 'good');
        this.say('carrier', {}, true);
      }
      if (rolled) {
        this.addCombo();
        const pts = Math.round(40 * r.mult);
        r.score += pts;
        p.boost = Math.min(1, p.boost + 0.06);
        EZ.UI.pop(`Barrel roll +${pts}`, 'trick');
        this.say('roll');
      }
    }
    onTube() {
      EZ.Audio.lower();
      EZ.Music.riser(1.4);
      EZ.UI.pop('Suction grip', 'good');
      this.police.cancelPit();
      this.say('tube', {}, true);
      this.vibrate(30);
    }
    onTubeLand() {
      const p = this.player, r = this.run;
      this.addCombo(3);
      const pts = Math.round(500 * r.mult);
      r.score += pts;
      p.boost = Math.min(1, p.boost + 0.3);
      EZ.UI.pop(`Ceiling run +${pts}`, 'good');
      EZ.Audio.land(2);
      this.fx.dust(p.x, -p.s, -p.speed * 0.2, 26);
      this.fx.vapor(p.x, 0.2, -p.s, 0, -1, -p.speed * 0.3, 18);
      this.say('landed', {}, true);
    }
    onDeck() {
      EZ.Audio.deck();
      EZ.Music.riser(1.2);
      this.police.cancelPit();
      this.vibrate(25);
    }
    onDeckLaunch() {
      const p = this.player;
      EZ.Audio.hop();
      EZ.Audio.boost();
      this.fx.vapor(p.x, p.y + 0.2, -p.s, 0, -5, -p.speed * 0.25, 18);
      this.shake = Math.max(this.shake, 0.3);
      this.vibrate(35);
    }
    onCargoBounce(e, v) {
      if (Math.abs(e.s - this.player.s) > 140) return;
      EZ.Audio.thud(Math.min(6, v));
      this.fx.dust(e.x, -e.s, e.vs * 0.2, 4);
    }
    // A toll arm snaps off the windscreen: no wreck, but the cruisers gain on you.
    smashGate(e) {
      const p = this.player, r = this.run;
      e.hitDone = true;
      e.type = 'decor';
      e.roll = 1.25;
      e.moving = true;
      this.ents.draw(e);
      r.gap -= 16;
      this.breakCombo();
      EZ.Audio.scrape();
      EZ.Audio.glass();
      this.fx.chips(p.x, 1.25, -p.s - 2, 0, 3, -p.speed * 0.35, 14, [0xc8102e, 0xf6f7f3, 0xf6f7f3], 0.9);
      this.fx.glass(p.x, 1.1, -p.s - 1.6, -p.speed * 0.2, 14);
      EZ.UI.pop('Smashed the toll arm', 'bad');
      this.shake = 0.45;
      this.vibrate(50);
      if (r.gap <= 0) this.bust('caught');
    }
    // An EMP mine goes off under the car: thrusters dead for a moment, the cruisers gain.
    empHit(e) {
      const p = this.player, r = this.run;
      e.hitDone = true;
      e.type = 'decor';
      p.emp = 2.6;
      p.hops = 0;
      p.hopCharge = 0;
      p.battery = Math.max(0, p.battery - 8);
      r.gap -= 11;
      this.breakCombo();
      EZ.Audio.emp();
      for (let i = 0; i < 3; i++) this.fx.sparks(p.x + EZ.rand(-0.8, 0.8), 0.3, -p.s - 0.5, 0, -p.speed * 0.3, 14, this.fx.c.blue);
      this.fx.vapor(p.x, 0.2, -p.s, 0, 3, -p.speed * 0.3, 10);
      EZ.UI.pop('EMP hit: thrusters offline', 'bad');
      EZ.UI.emp();
      this.say('emp');
      this.shake = 0.5;
      this.vibrate([40, 30, 60]);
      if (r.gap <= 0) this.bust('caught');
    }
    onBoost() {
      const p = this.player;
      EZ.Audio.boost();
      EZ.Music.riser(0.9);
      this.police.cancelPit();
      this.shake = Math.max(this.shake, 0.3);
      for (const sx of [-0.86, 0.86]) this.fx.tyreSmoke(p.x + sx, 0, -p.s + 1.4, 0, 6);
      EZ.UI.pop('Launch', 'good');
      this.say('boost');
      this.vibrate(40);
    }
    vibrate(pattern) {
      // browsers refuse vibration until the player has touched the page
      const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (EZ.store.data.settings.haptics && navigator.vibrate && touched) { try { navigator.vibrate(pattern); } catch (e) { /* not allowed */ } }
    }
    say(ev, data = {}, force = false) {
      const r = this.run, now = this.time;
      const lines = LINES[ev];
      if (!lines) return;
      if (!force) {
        if (r.said[ev] != null && now - r.said[ev] < (COOLDOWN[ev] || 12)) return;
        if (now - r.lastSay < 3.2) return;
      }
      r.said[ev] = now;
      r.lastSay = now;
      const [who, text] = EZ.pick(lines);
      const b = this.world.biomeAt(this.player.s);
      EZ.UI.radio(who, text
        .replace('{road}', b.place)
        .replace('{place}', b.name)
        .replace('{color}', EZ.paintById(EZ.store.data.paint).call)
        .replace('{side}', data.side || 'left')
        .replace('{speed}', `${EZ.fmt.speed(this.player.speed)} ${EZ.fmt.speedUnit()}`));
    }
    addCombo(n = 1) {
      const r = this.run;
      r.combo += n;
      r.comboT = 4;
      r.mult = 1 + Math.min(r.combo, 20) * 0.2;
    }
    breakCombo() {
      const r = this.run;
      r.combo = 0;
      r.comboT = 0;
      r.mult = 1;
    }

    // ---------------------------------------------------------------- update: run
    updateIntro(dt) {
      this.introT += dt;
      const p = this.player, r = this.run, t = this.introT;
      p.tick(dt);
      p.step(dt);
      this.police.step(dt, r.gap, true);
      if (t > 0.15 && !r.whooped) {
        r.whooped = true;
        EZ.Audio.whoop();
        this.say('start', {}, true);
      }
      this.ents.planner.update(p.s);
      this.ents.spawnDue(p.s);
      // a moment on the line: the motors wind up against the brakes, the car squats, the tyres smoke
      if (t > 0.3) {
        if (!r.squat) { r.squat = true; p.heaveV -= 0.45; p.pitchV += 0.2; }
        p.wheelRot += dt * 32;
        if (Math.random() < dt * 24) for (const sx of [-0.86, 0.86]) this.fx.tyreSmoke(p.x + sx, 0, -p.s + 1.5, 0, 1);
      }
      if (t >= LAUNCH_AT) this.launch();
    }
    // 0-60 in about 0.8 s: the rear thrusters, a thump, and the camera left behind for a moment
    launch() {
      const p = this.player;
      this.state = 'run';
      p.launch = 2.2;
      p.pitchV += 0.9;
      p.heaveV -= 0.4;
      p.fire.rear = 1;
      this.launchCam = 0;
      this.shake = Math.max(this.shake, 0.55);
      EZ.Audio.launch();
      EZ.UI.speedLaunch(true);
      this.vibrate(60);
    }
    updateRun(dt) {
      const p = this.player, r = this.run;
      r.time += dt;
      p.tick(dt);
      let target = EZ.Player.baseSpeed(p.s);
      if (p.boosting > 0) target *= 1.34;
      if (p.battery < 12) target *= EZ.lerp(0.55, 1, p.battery / 12);
      if (p.stumble > 0) target *= 0.78;
      if (p.spiked > 0) target *= 0.85;
      // never under sixty while the battery holds; only a dying battery slows it further
      if (p.battery >= 12) target = Math.max(target, C.SIXTY);
      const s0 = p.s;
      // rear thrusters: 0-60 in about 0.8 s at the start, and again when you hit Launch
      const thrust = (p.launch > 0 && p.speed < 27.5) || p.boosting > 2.5;
      if (thrust) p.fire.rear = Math.max(p.fire.rear, 0.06);
      const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
      for (let i = 0; i < n && this.state === 'run'; i++) {
        const up = target > p.speed;
        const acc = up ? (thrust ? C.LAUNCH_ACCEL : p.speed < 27 ? 15 : p.boosting > 0 ? 18 : 8) : 24;
        const ns = up ? Math.min(target, p.speed + acc * h) : Math.max(target, p.speed - acc * h);
        p.accel = EZ.damp(p.accel, (ns - p.speed) / h, 8, h);
        p.speed = ns;
        this.prev = { x: p.x, s: p.s, top: p.top, bot: p.bottom };
        p.step(h);
        this.ents.step(h, p.s, p.speed);
        this.police.step(h, r.gap, true);
        this.collide();
        if (this.state === 'run') this.pitCollide();
      }
      if (this.state !== 'run') return;
      if (!r.launchDone && p.speed >= C.SIXTY) {
        r.launchDone = true;
        // a beat of slow motion as the needle hits sixty
        this.slowMo(0.3, 0.14, 0.6);
        EZ.UI.speedLaunch(false);
        this.vibrate(28);
        this.say('launch');
      }
      if (this.quick && r.time > 25) this.endQuick(true);
      r.score += p.s - s0;
      r.top = Math.max(r.top, p.speed);

      // charge
      p.battery = Math.max(0, p.battery - dt * (0.62 + (p.boosting > 0 ? 0.9 : 0) + (p.hover > 0 ? 0.6 : 0)));
      // the gap to the lead cruiser
      let rate = 2.0;
      if (p.launch > 0) rate += 9;
      if (p.boosting > 0) rate += 6;
      if (this.police.lit && !p.stunt) rate -= 6.5;
      if (p.inTube) rate += 8;
      if (p.battery < 12) rate -= (12 - p.battery) * 0.65;
      r.gap = Math.min(C.GAP_MAX, r.gap + rate * dt);
      if (p.jammer > 0) r.gap = C.GAP_MAX;
      if (r.gap <= 0) { this.bust(p.battery < 1 ? 'battery' : 'caught'); return; }

      // combo
      if (r.comboT > 0) { r.comboT -= dt; if (r.comboT <= 0) this.breakCombo(); }
      r.voltT -= dt;
      if (r.voltT <= 0) r.voltStep = 0;

      this.ents.planner.update(p.s);
      this.ents.spawnDue(p.s);
      this.police.maybePit(dt, r);
      this.police.stepHeli(dt, this.world.night, true);
      this.ch.update(dt);

      const bk = this.world.biomeAt(p.s).key;
      if (bk !== r.biome) { if (r.biome) this.say('biome', {}, true); r.biome = bk; }
      if (p.battery < 15) this.say('battery');
      // tell the driver the moment Launch is ready, and how to fire it
      const ready = p.boost >= 1 && p.boosting <= 0;
      if (ready && !r.launchReady) {
        EZ.UI.pop(EZ.touch ? 'Launch ready: double-tap' : 'Launch ready: Shift', 'good');
        EZ.Audio.chargeOn();
      }
      r.launchReady = ready;
      if (r.gap < 10) this.say('close');
    }

    // ---------------------------------------------------------------- collisions
    collide() {
      const p = this.player, r = this.run, pv = this.prev;
      const px = p.x, ps = p.s, top = p.top, bot = p.bottom;
      const deck = p.onDeck ? p.stunt.group : null;
      for (const e of this.ents.list) {
        if (e.dead) continue;
        // markers like the toll plaza score when you get past them
        if (e.onPass && e.type === 'none' && !e.passed && e.s + e.hl < ps - C.P_HL) { e.passed = true; this.passed(e); continue; }
        if (e.type === 'none' || e.type === 'decor') continue;
        if (deck && e.group === deck) continue;
        const ds = e.s - ps;
        if (p.coil > 0 && e.type === 'volt' && e.mode === 'meet' && !e.hidden && ds < 32 && ds > -3) e.mode = 'magnet';
        if (ds > e.hl + 8 || ds < -e.hl - 8) continue;
        const dx = Math.abs(e.x - px);
        if (e.type === 'volt' || e.type === 'pickup') {
          if (e.hidden && e.type === 'volt') continue;
          if (Math.abs(ds) < e.hl + C.P_HL && dx < e.hw + C.P_HW && e.y > bot - 0.7 && e.y < top + 0.7) this.collect(e);
          continue;
        }
        if (e.type === 'tube') {
          if (!p.stunt && !p.crashed && Math.abs(ds) < 1.6 && dx < e.hw && p.y < 2.5) { p.startTube(e); this.onTube(); }
          continue;
        }
        if (e.type === 'ramp') {
          // nose onto the foot of the carrier's ramp, low enough to catch it
          const foot = e.s - e.hl, front = ps + C.P_HL;
          if (!p.stunt && !p.crashed && dx < e.hw && front > foot && front < foot + 3.5 && bot < 1.3 && p.startDeck(e)) this.onDeck();
          continue;
        }
        if (p.inTube) continue;
        if (e.mode === 'rel' && e.ghostUntil) continue;
        const ox = dx < e.hw + C.P_HW;
        const os = Math.abs(ds) < e.hl + C.P_HL;
        const y0 = e.y0 + e.y, y1 = e.y1 + e.y;
        // spike strips sit lower than the car's floor: they catch the tyres whenever you're on the road
        const oy = e.type === 'spike' || e.type === 'emp' ? !p.air && p.y < 0.2 : bot < y1 && top > y0;
        if (os) {
          e.overS = true;
          if (!ox) e.minClear = Math.min(e.minClear, dx - e.hw - C.P_HW);
          else {
            if (p.air && bot >= y1) { e.cleared = true; if (p.rolling) e.rolled = true; }
            if (e.type === 'low' && top <= y0) e.ducked = true;
          }
        }
        if (ox && os && oy && !e.hitDone) {
          const wasX = Math.abs(e.prevX - pv.x) < e.hw + C.P_HW;
          const wasS = Math.abs(e.prevS - pv.s) < e.hl + C.P_HL;
          const wasY = pv.bot < y1 && pv.top > y0;
          const kind = !wasS ? (e.s < ps ? 'rear' : 'front') : !wasX ? 'side' : !wasY ? 'vertical' : 'side';
          this.hit(e, kind);
          if (this.state !== 'run') return;
        }
        if (!e.passed && e.s + e.hl < ps - C.P_HL) {
          e.passed = true;
          this.passed(e);
        }
      }
    }
    hit(e, kind) {
      const p = this.player, r = this.run;
      if (p.ghost > 0 || p.hover > 0) return;
      if (e.type === 'emp') { this.empHit(e); return; }
      if (e.kind === 'gate') { this.smashGate(e); return; }
      if (e.type === 'spike') {
        if (p.air || p.spiked > 0) return;
        e.hitDone = true;
        p.spiked = 2.4;
        r.gap -= 20;
        this.breakCombo();
        EZ.Audio.spike();
        EZ.UI.pop('Tyres spiked', 'bad');
        this.say('spikes');
        this.shake = 0.4;
        this.vibrate(60);
        if (r.gap <= 0) this.bust('caught');
        return;
      }
      if (e.type === 'soft') {
        e.hitDone = true;
        e.type = 'decor';
        this.ents.launch(e, p.speed * 0.7, (e.x - p.x) * 5 + EZ.rand(-2, 2), EZ.rand(4, 8), EZ.rand(-8, 8), 2.2);
        EZ.Audio.cone();
        if (p.boosting <= 0) { r.gap -= 4; this.breakCombo(); }
        return;
      }
      // landing on a roof: the thrusters cushion it and you bounce off
      if (kind === 'vertical' && p.vy <= 0 && e.type === 'hard') {
        e.hitDone = true;
        p.y = e.y1 + e.y - C.BOTTOM + 0.02;
        p.vy = 7.5;
        p.air = true;
        this.addCombo(2);
        r.score += 100 * r.mult;
        EZ.UI.pop(`Roof bounce +${Math.round(100 * r.mult)}`, 'trick');
        EZ.Audio.land(6);
        return;
      }
      // past this point the set piece counts as fumbled (a roof bounce above is fine)
      if (e.group) e.group.hit = true;
      if (kind === 'side' || kind === 'rear') { this.stumble(e); return; }
      if (p.shield > 0) {
        p.shield = 0;
        e.hitDone = true;
        if (e.kind === 'car' || e.kind === 'pit' || e.kind === 'cruiser') {
          this.ents.wreck(e, p.speed * 0.9);
          e.vx = (e.x >= p.x ? 1 : -1) * 9;
        } else {
          e.type = 'decor';
          this.ents.launch(e, p.speed * 0.8, (e.x >= p.x ? 1 : -1) * 6, 7, EZ.rand(-5, 5), 2.5);
        }
        EZ.Audio.crash();
        this.fx.sparks(p.x, 0.8, -p.s - 2.2, 0, -p.speed * 0.3, 30);
        EZ.UI.pop('Deflected', 'good');
        this.say('shield');
        this.shake = 0.8;
        p.ghost = 0.6;
        return;
      }
      this.bust('crash', e);
    }
    stumble(e) {
      const p = this.player, r = this.run;
      e.hitDone = true;
      if (e.group) e.group.hit = true;
      const pushed = e.kind === 'pit' || (e.cut && e.cut.started);
      if (pushed) {
        const away = p.x >= e.x ? 1 : -1;
        const l = EZ.clamp(p.lane + away, 0, C.LANES - 1);
        if (l !== p.lane) { p.prevLane = p.lane; p.lane = l; }
        p.vx += away * 6;
      } else {
        p.bounceBack();
      }
      p.stumble = 1.2;
      p.wobble = 0.3;
      p.scrape = 0.45;
      p.scrapeSide = e.x >= p.x ? 1 : -1;
      this.fx.chips(p.x + p.scrapeSide * 0.95, 0.5, -p.s, p.scrapeSide * 2, -1, -p.speed * 0.35, 5, [EZ.paintById(EZ.store.data.paint).color, 0x15171a], 0.55);
      r.gap -= C.STUMBLE_GAP;
      this.breakCombo();
      EZ.Audio.scrape();
      this.fx.sparks((p.x + e.x) / 2, 0.6, -p.s - 0.5, (p.x - e.x) * 2, -p.speed * 0.25, 22);
      EZ.UI.pop('Scraped', 'bad');
      this.shake = 0.5;
      this.vibrate(70);
      this.say('stumble');
      if (r.gap <= 0) this.bust('caught');
    }
    passed(e) {
      const r = this.run, p = this.player;
      if (e.onPass) this.groupPassed(e);
      if (e.hitDone) return;
      if (e.near && e.overS && e.minClear < 0.95 && e.minClear > -0.05) {
        r.near++;
        this.addCombo();
        const pts = Math.round(50 * r.mult);
        r.score += pts;
        p.boost = Math.min(1, p.boost + 0.18);
        EZ.UI.pop(`Close call +${pts}`, 'near');
        EZ.Audio.nearMiss();
        r.nearChain++;
        if (r.nearChain % 5 === 0) this.say('near');
        return;
      }
      if (e.cleared && (e.type === 'hard' || e.type === 'spike' || e.type === 'low' || e.type === 'emp')) {
        this.addCombo();
        const pts = Math.round(30 * r.mult);
        r.score += pts;
        p.boost = Math.min(1, p.boost + 0.07);
        EZ.UI.pop(`${e.rolled ? 'Rolled over' : 'Clean hop'} +${pts}`, 'trick');
        this.say(e.rolled ? 'roll' : 'hop');
        return;
      }
      if (e.ducked) {
        this.addCombo();
        const pts = Math.round(40 * r.mult);
        r.score += pts;
        p.boost = Math.min(1, p.boost + 0.08);
        EZ.UI.pop(`Slid under +${pts}`, 'trick');
        this.say('duck');
      }
    }
    // Bonuses for getting through a whole set piece cleanly.
    groupPassed(e) {
      const r = this.run, grp = e.group, p = this.player;
      if (!grp || this.state !== 'run') return;
      if (e.onPass === 'rolling') {
        grp.passed++;
        if (grp.passed < grp.n || grp.hit) return;
        this.addCombo(3);
        const pts = Math.round(300 * r.mult);
        r.score += pts;
        p.boost = Math.min(1, p.boost + 0.3);
        r.gap = Math.min(C.GAP_MAX, r.gap + 10);
        EZ.UI.pop(`Rolling block broken +${pts}`, 'good');
        this.say('rollingBroken', {}, true);
      } else if (e.onPass === 'toll') {
        if (grp.hit) return;
        this.addCombo(2);
        const pts = Math.round(80 * r.mult);
        r.score += pts;
        EZ.Audio.tollBeep();
        EZ.UI.pop(`Toll evaded +${pts}`, 'trick');
        this.say('toll');
      }
    }
    collect(e) {
      const p = this.player, r = this.run;
      this.ents.kill(e);
      if (e.type === 'volt') {
        r.volts++;
        p.battery = Math.min(100, p.battery + 1.1);
        r.score += 10 * r.mult;
        p.boost = Math.min(1, p.boost + 0.012);
        EZ.Audio.volt(r.voltStep++);
        r.voltT = 0.7;
        this.fx.voltBurst(e.x, e.y, -e.s, -p.speed * 0.5);
        return;
      }
      EZ.Audio.pickup();
      const k = e.pickup;
      const name = { charge: 'Full charge', coil: 'Volt coil', jammer: 'Radar jammer', shield: 'Deflector', hover: 'Cold-gas hover' }[k];
      EZ.UI.pop(name, 'good');
      if (k === 'charge') p.battery = 100;
      else if (k === 'coil') p.coil = 9;
      else if (k === 'jammer') { p.jammer = 10; r.gap = C.GAP_MAX; this.police.cancelPit(); this.say('jammer', {}, true); }
      else if (k === 'shield') p.shield = 1;
      else if (k === 'hover') {
        p.hover = 6;
        p.low = 0;
        p.air = true;
        this.say('hover', {}, true);
        for (let i = 0; i < 20; i++) {
          this.ents.make({ kind: 'volt', pool: 'volt', type: 'volt', lane: p.lane, x: EZ.laneX(p.lane), k: 0, M: p.s + 30 + i * 7, y: 4.5, hw: 0.45, hl: 0.45, y1: 0 });
        }
      }
    }
    pitCollide() {
      const P = this.police.pit;
      if (!P) return;
      const c = P.e;
      if (c.dead || c.mode !== 'rel' || c.ghostUntil) return;
      for (const e of this.ents.list) {
        if (e === c || e.dead) continue;
        if (!(e.type === 'hard' || e.type === 'low' || e.type === 'spike' || e.type === 'soft')) continue;
        if (Math.abs(e.s - c.s) < e.hl + c.hl && Math.abs(e.x - c.x) < e.hw + c.hw) {
          this.ents.wreck(c, this.player.speed * 0.85);
          if (e.kind === 'car') this.ents.wreck(e, e.k * this.player.speed);
          if (e.type === 'soft') { e.type = 'decor'; this.ents.launch(e, this.player.speed * 0.6, EZ.rand(-3, 3), 6, 4, 2); }
          const r = this.run;
          r.wrecks++;
          this.addCombo(3);
          const pts = Math.round(300 * r.mult);
          r.score += pts;
          this.player.boost = Math.min(1, this.player.boost + 0.35);
          EZ.UI.pop(`Cruiser wrecked +${pts}`, 'good');
          EZ.Audio.wreck();
          this.fx.sparks(c.x, 0.7, -c.s, 0, -this.player.speed * 0.4, 26);
          this.say('wreck', {}, true);
          this.police.pit = null;
          this.police.side = 0;
          return;
        }
      }
    }

    // ---------------------------------------------------------------- the end
    bust(reason, e) {
      if (this.state !== 'run') return;
      const p = this.player, r = this.run;
      r.reason = reason;
      r.hitKind = e ? (e.roadblock ? 'roadblock' : CHARGES[e.model] ? e.model : e.kind) : null;
      this.state = 'busted';
      this.bustT = 0;
      this.citeT = 0;
      this.ents.freeze(p.speed);
      if (reason === 'crash') {
        const v = p.speed;
        const dx = e ? e.x - p.x : 0;
        const side = Math.abs(dx) > 0.35 ? (dx > 0 ? -1 : 1) : Math.random() < 0.5 ? -1 : 1;
        const sev = p.crash({ side, low: !!e && e.type === 'low' });
        const x = p.x, z = -p.s - 2.1;
        const paint = EZ.paintById(EZ.store.data.paint).color;
        EZ.Audio.crash();
        EZ.Audio.glass();
        this.fx.sparks(x, 0.7, z, 0, -v * 0.1, 50);
        this.fx.glass(x, 1.0, z + 0.8, -v * 0.15, 36);
        this.fx.chips(x, 0.7, z, 0, 1, -v * 0.3, 16 + sev * 16, [paint, paint, 0x15171a, 0x7a5a22], 1);
        this.fx.smokeColumn(x, 0.9, z + 0.6, 8);
        this.shake = 1.3;
        this.slowMo(0.2, 0.5, 1.3);
        this.flash();
        if (e) this.knockOn(e, v, side, sev);
      } else {
        EZ.Audio.bust();
        this.shake = 0.5;
        // the lead cruiser taps the rear quarter and the car spins out
        p.pitSpin(Math.random() < 0.5 ? -1 : 1);
        this.fx.sparks(p.x, 0.5, -p.s + 2.1, 0, -p.speed * 0.2, 18);
      }
      this.police.bust(reason);
      EZ.Music.sting();
      // the mirror and the distance readout have nothing left to say
      EZ.UI.el.mirror.hidden = true;
      EZ.UI.el.hudGap.hidden = true;
      this.vibrate([90, 50, 160]);
      // a short first run doesn't count as having learned the controls
      if (this.quick) this.endQuick(this.run.time > 12);
      this.say(reason === 'crash' ? 'crash' : 'caught', {}, true);
    }
    // What happens to the thing you hit.
    knockOn(e, v, side, sev) {
      const fx = this.fx;
      if (e.kind === 'car' || e.kind === 'pit' || e.kind === 'cruiser') {
        const heavy = e.heavy || e.model === 'semi' || e.model === 'box';
        const base = e.mode === 'meet' ? e.k * v : e.vs || 0;
        if (heavy) this.ents.wreck(e, base + v * 0.08, { spin: EZ.rand(-0.4, 0.4), vx: -side * 0.6 });
        else {
          this.ents.wreck(e, base + v * 0.42, {
            vx: -side * EZ.rand(2, 4), vy: 2 + sev * 5.5, spin: EZ.rand(-3, 3),
            roll: -side * EZ.rand(2, 6) * sev, pitch: EZ.rand(-1.2, 1.2) * sev,
          });
        }
        const col = e.kind === 'car' ? e.color : 0x15171a;
        fx.chips(e.x, 0.8, -(e.s + e.hl), 0, 1, -(base + v * 0.3), 10, [col, col, 0xf1f1ec, 0x1d2933], 0.9);
      } else if (e.kind === 'barrier') {
        e.type = 'decor';
        this.ents.launch(e, v * 0.32, -side * EZ.rand(1, 3), 3 + sev * 3, EZ.rand(-4, 4), 3.5);
        fx.chips(e.x, 0.5, -e.s, 0, 2, -v * 0.25, 14, [0xbdb8ac, 0xa49f93, 0xffc72c], 1.1);
      } else if (e.kind === 'cargo') {
        // the crate bursts, the drum gets punted down the road
        e.type = 'decor';
        e.keepRoll = false;
        this.ents.launch(e, v * 0.5, -side * EZ.rand(1, 3), 4 + sev * 3, EZ.rand(-6, 6), 3);
        const wood = e.cargo === 'crate';
        fx.chips(e.x, 0.6, -e.s, 0, 2, -v * 0.3, wood ? 22 : 10, wood ? [0xb07c45, 0x8a5c30, 0x6e4724] : [e.color || 0x1d4f9c, 0x3a3d42], wood ? 1.2 : 0.9);
        if (wood) e.life = 0.05;
      } else if (e.kind === 'gate') {
        e.type = 'decor';
        e.roll = 1.2;
        e.moving = true;
        fx.chips(e.x, 1.2, -e.s, 0, 2, -v * 0.3, 10, [0xc8102e, 0xf6f7f3], 0.8);
      } else {
        fx.sparks(e.x, 1.2, -e.s, 0, -v * 0.1, 30);
        fx.chips(this.player.x, 1.0, -this.player.s - 2, 0, 1, -v * 0.2, 8, [0x2a2c30, 0x9aa0a6], 0.8);
      }
    }
    onWreckBounce(x, z, impact, vel) {
      EZ.Audio.thud(impact);
      this.fx.sparks(x, 0.05, z, vel.x * 0.4, vel.z * 0.4, Math.min(24, 6 + impact * 1.5));
      this.fx.dust(x, z, vel.z * 0.3, Math.min(12, 3 + impact));
      if (impact > 5) this.fx.chips(x, 0.3, z, vel.x * 0.5, 0, vel.z * 0.5, 4, [EZ.paintById(EZ.store.data.paint).color, 0x15171a], 0.7);
      this.shake = Math.max(this.shake, Math.min(0.7, impact * 0.05));
      this.vibrate(Math.min(60, 10 + impact * 4));
    }
    flash() {
      const el = document.getElementById('impactFlash');
      if (!el) return;
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
    }
    updateBusted(dt) {
      this.bustT += dt;
      const p = this.player;
      p.tick(dt);
      const decel = p.crashed ? 32 : 13;
      p.speed = Math.max(0, p.speed - decel * dt);
      p.accel = p.speed > 0 ? -decel : 0;
      p.step(dt);
      this.ents.step(dt, p.s, p.speed);
      this.police.bustStep(dt, this.bustT);
      this.police.stepHeli(dt, this.world.night, false);
      this.ch.bustStep(dt);
      if (Math.random() < 0.3 && p.crashed && p.wreck) this.fx.smokeColumn(p.x, Math.max(0.6, p.y + 0.9), -p.s - 1.2, 1);
      // a tumbling wreck gets to come to rest before the ticket arrives
      const done = p.wreck ? (p.wreck.settled && this.bustT > 2.7) || this.bustT > 4.6 : this.bustT > 2.6;
      if (done) this.showCitation();
    }
    showCitation() {
      const d = EZ.store.data, r = this.run, p = this.player;
      const prevBest = d.best;
      const milesBefore = d.totalDist / C.MILE;
      const score = Math.round(r.score);
      const record = score > d.best;
      d.totalDist += p.s;
      d.best = Math.max(d.best, score);
      EZ.Play.submit(score);
      d.bestDist = Math.max(d.bestDist, p.s);
      if (p.s > 1200) d.tutorial = true;
      const milesAfter = d.totalDist / C.MILE;
      const unlocked = EZ.PAINTS.filter((x) => x.unlock > milesBefore && x.unlock <= milesAfter).pop();
      EZ.store.save();
      const b = this.world.biomeAt(p.s);
      const charge = r.reason === 'crash' ? CHARGES[r.hitKind] || 'Collision while evading arrest' : CHARGES[r.reason];
      EZ.UI.showHud(false);
      EZ.UI.citation({
        no: String(EZ.randi(100000, 999999)),
        vehicle: `Roadster, ${EZ.paintById(d.paint).name.toLowerCase()}`,
        charge,
        location: `${b.place}, ${EZ.fmt.markerLabel().toLowerCase()} ${EZ.fmt.dist(p.s)}`,
        dist: `${EZ.fmt.dist(p.s)} ${EZ.fmt.distUnit()}`,
        top: `${EZ.fmt.speed(r.top)} ${EZ.fmt.speedUnit()} in a ${EZ.fmt.limit()} zone`,
        near: String(r.near),
        volts: String(r.volts),
        wrecks: String(r.wrecks),
        time: EZ.fmt.time(r.time),
        score: EZ.fmt.int(score),
        record: record && prevBest > 0,
        prevBest: EZ.fmt.int(prevBest),
        best: EZ.fmt.int(d.best),
        officer: `${EZ.pick(OFFICERS)}, unit ${EZ.randi(2, 48)}`,
        unlock: unlocked ? unlocked.name : null,
      });
      this.state = 'citation';
      this.citeT = 0;
    }

    // ---------------------------------------------------------------- camera
    // vertical field of view that shows a given horizontal angle at the current aspect
    fovForWidth(deg) {
      return (2 * Math.atan(Math.tan((deg * PI) / 360) / this.aspect) * 180) / PI;
    }

    updateCamera(dt) {
      const cam = this.camera, p = this.player, r = this.run;
      const portrait = EZ.clamp((1.15 - this.aspect) / 0.6, 0, 1);
      const pos = new T.Vector3(), look = new T.Vector3();
      let fov = 50;
      const st = this.state === 'paused' ? this.resumeTo : this.state;
      if (st === 'run' || st === 'intro') {
        const gapPull = EZ.clamp((12 - r.gap) / 12, 0, 1);
        // launch: the car leaps out from under the camera, which takes a second to catch up
        let surge = 0;
        if (this.launchCam != null) {
          const t = (this.launchCam += dt);
          surge = t < 0.3 ? EZ.smoothstep(0, 0.3, t) : Math.exp(-(t - 0.3) * 2.4);
          if (t > 2.5) this.launchCam = null;
        }
        const back = EZ.lerp(7.6, 8.4, portrait) + gapPull * 4.5 + (p.boosting > 0 ? 1.3 : 0) + surge * 3;
        const height = EZ.lerp(3.4, 4.6, portrait) + gapPull * 1.2;
        const ahead = EZ.lerp(10, 6, portrait);
        const follow = p.inTube ? 0.95 : EZ.lerp(0.55, 0.86, portrait);
        // inside the tube the camera drops below the car so the ceiling deck never hides it
        const inv = p.inTube ? (1 - Math.cos(p.stuntRoll)) / 2 : 0;
        if (p.inTube) {
          pos.set(p.x * follow, EZ.lerp(height + p.y * 0.9, 4.4, inv), -p.s + back + 0.6);
          look.set(p.x, EZ.lerp(1.0 + p.y * 0.95, p.y + 0.4, inv), -p.s - ahead);
        } else {
          pos.set(p.x * follow, height + p.y * 0.55, -p.s + back);
          look.set(p.x * follow * 0.9, 1.0 + p.y * 0.45, -p.s - ahead);
        }
        // tall phones frame by width instead: the same 34° across the road on any of them
        fov = Math.max(56, this.fovForWidth(34)) + EZ.clamp((p.speed - 35) * 0.14, 0, 8) + (p.boosting > 0 ? 7 : 0) + surge * 10;
        if (st === 'intro') {
          const k = EZ.smoothstep(0, LAUNCH_AT + 0.1, this.introT);
          pos.lerpVectors(this.camFrom, pos, k);
          look.lerpVectors(this.lookFrom, look, k);
        } else {
          pos.x = EZ.damp(cam.position.x, pos.x, 6, dt);
          pos.y = EZ.damp(cam.position.y, pos.y, 5, dt);
        }
      } else if (st === 'busted' || st === 'citation') {
        const t = (this.bustT || 0) + (this.citeT || 0);
        const a = PI * 0.32 + t * 0.22;
        const close = p.wreck ? 1 - EZ.smoothstep(0.4, 2.6, t) : 0;
        const R = EZ.lerp(EZ.lerp(11, 14, portrait), 6.8, close);
        pos.set(p.x + Math.sin(a) * R, EZ.lerp(4.2 + portrait * 2, 2.2, close) + Math.max(0, p.y) * 0.5, -p.s + Math.cos(a) * R);
        look.set(p.x, 0.8 + Math.max(0, p.y) * 0.8, -p.s);
        pos.lerp(cam.position, Math.exp(-3 * dt));
        fov = EZ.lerp(50, 66, portrait);
      } else if (st === 'paint') {
        const a = PI * 0.62 + this.time * 0.22;
        const R = EZ.lerp(6.4, 9.5, portrait);
        pos.set(p.x + Math.sin(a) * R, 1.5 + portrait * 1.2, -p.s + Math.cos(a) * R);
        look.set(p.x, 0.15 + portrait * 0.4, -p.s);
        fov = EZ.lerp(46, 62, portrait);
      } else {
        // title: swing slowly across the front three-quarter view
        const a = PI * 0.8 + Math.sin(this.time * 0.13) * 0.42;
        const R = EZ.lerp(7.6, 12.5, portrait);
        pos.set(p.x + Math.sin(a) * R, 1.45 + portrait * 1.1, -p.s + Math.cos(a) * R);
        look.set(p.x, EZ.lerp(2.0, -0.2, portrait), -p.s);
        fov = EZ.lerp(48, 62, portrait);
      }
      this.shake = Math.max(0, this.shake - dt * 1.6);
      if (this.shake > 0 && dt > 0 && EZ.store.data.settings.shake) {
        const a = this.shake * this.shake * 0.35;
        pos.x += EZ.rand(-a, a); pos.y += EZ.rand(-a, a) * 0.6;
      }
      cam.position.copy(pos);
      this.camLook.copy(look);
      cam.lookAt(look);
      if (st === 'run') cam.rotateZ(p.inTube ? 0.3 * Math.sin(p.stuntRoll / 2) : EZ.clamp(-p.vx * 0.0028, -0.04, 0.04));
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = EZ.damp(cam.fov, fov, 4, dt || 1);
        cam.updateProjectionMatrix();
        this.fx.setScale(this.h * this.renderer.getPixelRatio(), cam.fov);
      }
      // rear-view mirror: on the roof, looking back
      const m = this.mirrorCam;
      const up = p.stuntRoll;
      m.position.set(p.x - 0.82 * Math.sin(up), p.y + 0.6 + 0.82 * Math.cos(up), -p.s + 0.25);
      m.lookAt(p.x * 0.6, 1.1 + p.y * 0.6, -p.s + 40);
    }

    learned(kind) {
      if (this.quick && EZ.UI.quickUsed(kind)) this.endQuick(true);
    }
    endQuick(learnt) {
      this.quick = false;
      EZ.UI.quickstart(false);
      if (learnt) { EZ.store.data.controlsSeen = true; EZ.store.save(); }
    }

    // ---------------------------------------------------------------- frame
    slowMo(low, hold, end) { this.slow = { t: 0, low, hold, end }; }
    loop(now) {
      requestAnimationFrame(this.loop);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05);
      const realDt = dt;
      // slow motion for a moment (after a crash, or as the launch hits sixty), easing back to full speed
      const sl = this.slow;
      if (sl) {
        sl.t += realDt;
        dt *= sl.t < sl.hold ? sl.low : EZ.lerp(sl.low, 1, EZ.smoothstep(sl.hold, sl.end, sl.t));
        if (sl.t > sl.end) this.slow = null;
      }
      this.time += dt;
      this.frame++;
      EZ.Input.poll();
      switch (this.state) {
        case 'intro': this.updateIntro(dt); break;
        case 'run': this.updateRun(dt); break;
        case 'busted': this.updateBusted(dt); break;
        case 'citation': this.citeT += dt; this.police.bustStep(dt, 3); this.police.stepHeli(dt, this.world.night, false); break;
        default: break;
      }
      const paused = this.state === 'paused';
      const vdt = paused ? 0 : dt;
      const p = this.player, night = this.world.night;
      this.flashColor = this.police.flashLights(this.time, night, this.state === 'title' || this.state === 'paint' ? 20 : this.run.gap);
      p.animate(vdt, this.time, night);
      if (!paused) {
        this.ents.render(dt);
        this.ch.render(dt);
        if (this.state === 'run' || this.state === 'intro') this.police.draw();
      }
      this.updateCamera(vdt);
      this.world.update(p.s, vdt, this.camera);
      this.updateEnv(this.world.envKey);
      this.fx.update(vdt, this.camera, p.speed, (p.boosting > 0 || (this.launchCam != null && this.launchCam < 1.1)) && this.state === 'run');
      this.updateAudio();
      if (this.inRun() || this.state === 'busted') EZ.UI.hud(this, realDt);
      this.render();
      this.perfCheck(dt);
    }
    updateAudio() {
      const A = EZ.Audio;
      if (!A.ready) return;
      const p = this.player;
      const live = this.state === 'run' || this.state === 'intro' || this.state === 'busted';
      // on the line the motors wind up before the launch
      const rev = this.state === 'intro' ? EZ.clamp((this.introT - 0.2) / (LAUNCH_AT - 0.2), 0, 1) : 0;
      A.drive(p.speed + rev * 9, p.accel + rev * 10, p.boosting > 0, live);
      A.fan(live ? p.suction : 0);
      // the siren only matters when a cruiser is genuinely close
      let level = 0;
      if (this.inRun()) level = EZ.clamp((26 - this.run.gap) / 26, 0, 1) * (p.jammer > 0 ? 0.2 : 1);
      else if (this.state === 'busted') level = 0.6;
      A.sirenLevel(level, this.state === 'busted' || (this.inRun() && this.run.gap < 10));
      // the soundtrack builds when the chase gets tight
      const M = EZ.Music;
      if (this.inRun()) {
        const hot = this.run.gap < 18 || this.police.lit || p.boosting > 0 || p.inTube || p.onDeck || this.police.heliOn || this.ch.hot;
        M.setLevel(this.state === 'intro' ? 1 : hot ? 2 : 1);
      } else if (this.state === 'title' || this.state === 'paint' || this.state === 'citation') {
        M.setLevel(0);
      }
      M.setMuffled(this.state === 'paused');
    }
    render() {
      const R = this.renderer;
      const mirror = this.mirrorOn();
      if (mirror && this.frame % this.mirrorEvery === 0) {
        R.setRenderTarget(this.mirrorRT);
        R.render(this.scene, this.mirrorCam);
        R.setRenderTarget(null);
      }
      R.render(this.scene, this.camera);
      if (mirror) {
        const m = this.mirrorRect;
        R.autoClear = false;
        R.setScissorTest(true);
        R.setScissor(m.x, m.y, m.w, m.h);
        R.setViewport(m.x, m.y, m.w, m.h);
        R.render(this.overlay, this.ortho);
        R.setScissorTest(false);
        R.setViewport(0, 0, this.w, this.h);
        R.autoClear = true;
      }
    }
  }

  // ---------------------------------------------------------------- boot
  EZ.boot = async function () {
    const bar = document.getElementById('bootBar'), msg = document.getElementById('bootMsg');
    const step = (p, m) => { bar.style.width = `${Math.round(p * 100)}%`; if (m) msg.textContent = m; };
    // a hidden tab never runs animation frames, so fall back to a timer
    const frame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
    step(0.3, 'Charging the battery');
    if (document.fonts && document.fonts.load) {
      try {
        await Promise.race([
          Promise.all([document.fonts.load('800 64px Overpass'), document.fonts.load('600 32px Overpass'), document.fonts.load('900 32px Overpass'), document.fonts.load('700 24px Kalam')]),
          new Promise((r) => setTimeout(r, 2500)),
        ]);
      } catch (e) { /* system fonts it is */ }
    }
    step(0.6, 'Painting the lane lines');
    await frame();
    let game;
    try {
      game = new Game();
    } catch (err) {
      console.error(err);
      if (window.EZ_FATAL) window.EZ_FATAL('This device could not start WebGL. Try another browser, or turn on hardware acceleration.');
      return;
    }
    step(1, 'Ready');
    EZ.game = game;
    await frame();
    if (game.state === 'title') EZ.UI.screen('title');
    else EZ.UI.el.boot.hidden = true;
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (!native && 'serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    // Android back button: pause a run, step back out of menus, leave from the title screen
    const App = native && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App) {
      App.addListener('backButton', () => {
        if (EZ.UI.settingsOpen()) EZ.UI.closeSettings();
        else if (game.inRun()) game.pause();
        else if (game.state === 'paused') game.resume();
        else if (game.state === 'paint' || game.state === 'citation') game.toTitle();
        else if (game.state === 'title') App.exitApp();
      });
      App.addListener('pause', () => { if (game.inRun()) game.pause(); EZ.Audio.silence(); });
      // the player may have signed in or out of Play Games while the app was in the background
      App.addListener('resume', () => EZ.Play.refresh());
    }
    EZ.Play.refresh();
  };

  EZ.Game = Game;
  EZ.boot();
})();
