/* Zero Sixty: menus, HUD, radio chatter and the citation. */
(function () {
  'use strict';
  const EZ = window.EZ;
  const $ = (id) => document.getElementById(id);

  // every control: [kind, key or gesture, how, what it does]
  const CONTROLS = {
    touch: [
      ['steer', '← →', 'Swipe left or right', 'Change lanes'],
      ['hop', '↑', 'Swipe up', 'Thruster hop'],
      ['low', '↓', 'Swipe down, hold to stay low', 'Ride low'],
      ['roll', '↖ ↗', 'Flick up and to one side', 'Barrel roll'],
      ['launch', 'Hold', 'Hold a finger still anywhere, or tap the yellow diamond', 'Launch'],
      ['pause', 'II', 'The button top left', 'Pause'],
    ],
    keys: [
      ['steer', '← →', 'Arrow keys, or A and D', 'Change lanes'],
      ['hop', '↑', 'Up, W or Space', 'Thruster hop'],
      ['low', '↓', 'Down or S, hold to stay low', 'Ride low'],
      ['roll', 'Q E', 'Q rolls left, E rolls right', 'Barrel roll'],
      ['launch', 'Shift', 'Shift or F', 'Launch'],
      ['pause', 'Esc', 'Esc or P', 'Pause'],
    ],
  };
  const QUICK = ['steer', 'hop', 'low', 'roll'];
  // recording mode: the set pieces the pause menu can call up next
  const RECORD = [['carrier', 'Car carrier'], ['tube', 'Suction tube'], ['rolling', 'Rolling roadblock'], ['toll', 'Toll plaza'],
    ['drones', 'Police drones'], ['wind', 'Crosswinds'], ['cargo', 'Cargo spill'], ['strip', 'Charging lane']];

  const UI = (EZ.UI = {
    init(game) {
      this.g = game;
      const ids = ['boot', 'bootMsg', 'bootBar', 'title', 'paint', 'settings', 'pause', 'citation', 'hud',
        'bestDist', 'bestUnit', 'titleControls', 'totalDist', 'swatches', 'paintName',
        'hudMile', 'hudSpeed', 'hudUnit', 'hudScore', 'hudMult', 'hudGap', 'mirror', 'mirrorGlass',
        'chargeFill', 'chargePct', 'charge', 'hops', 'btnLaunch', 'launchFill', 'flankL', 'flankR', 'bumper', 'holdRing',
        'btnPlay', 'playField', 'playName', 'btnPlaySignIn',
        'pops', 'powerups', 'dispatch', 'spotGlare', 'gust', 'empFx', 'speedSign', 'quick', 'quickCap', 'quickRow', 'ctlList', 'ctlPad',
        'recordPick', 'recordGrid',
        'tNo', 'tVehicle', 'tCharge', 'tLoc', 'tDist', 'tTop', 'tNear', 'tVolts', 'tWrecks', 'tTime', 'tScore', 'tBest', 'tUnlock', 'tOfficer'];
      this.el = {};
      for (const id of ids) this.el[id] = $(id);
      this.hopPips = Array.from(this.el.hops.querySelectorAll('i'));
      this.markerLabel = document.querySelector('.hud-mile .marker-label');

      const on = (id, fn) => $(id).addEventListener('click', (e) => { EZ.Audio.click(); fn(e); });
      on('btnDrive', () => game.startRun());
      on('btnPaint', () => game.openPaint());
      on('btnPaintDone', () => game.toTitle());
      on('btnSettings', () => this.openSettings());
      on('btnPlay', () => (EZ.Play.signedIn ? EZ.Play.show() : EZ.Play.signIn()));
      on('btnPlaySignIn', () => EZ.Play.signIn());
      on('btnSettingsDone', () => this.closeSettings());
      on('btnPause', () => game.pause());
      on('btnResume', () => game.resume());
      on('btnPauseSettings', () => this.openSettings());
      on('btnRestart', () => game.startRun());
      on('btnQuit', () => game.toTitle());
      on('btnAgain', () => { if (game.citeT > 0.7) game.startRun(); });
      on('btnMenu', () => game.toTitle());
      $('btnLaunch').addEventListener('pointerdown', (e) => { e.preventDefault(); game.action('boost', 'button'); });
      $('btnLaunch').addEventListener('click', (e) => { if (e.detail === 0) game.action('boost', 'button'); });

      this.bindSettings();
      this.buildControls();
      this.buildRecordPick();
      this.buildSwatches();
      this.refreshTitle();
      this.lastHud = 0;
      this.cache = {};
    },

    // ---------------------------------------------------------------- screens
    setBoot(p, msg) {
      this.el.bootBar.style.width = `${Math.round(p * 100)}%`;
      if (msg) this.el.bootMsg.textContent = msg;
    },
    screen(name) {
      for (const s of ['boot', 'title', 'paint', 'pause', 'citation']) this.el[s].hidden = s !== name;
      if (name !== 'pause' && name !== 'title') this.el.settings.hidden = true;
      if (name === 'title') this.refreshTitle();
      if (name === 'paint') this.buildSwatches();
      const focus = { title: 'btnDrive', pause: 'btnResume', citation: 'btnAgain', paint: 'btnPaintDone' }[name];
      if (focus && !EZ.touch) setTimeout(() => $(focus).focus({ preventScroll: true }), 30);
    },
    showHud(v) {
      this.el.hud.hidden = !v;
      if (v) {
        this.el.dispatch.innerHTML = '';
        this.el.pops.innerHTML = '';
        this.cache = {};
        this.el.mirror.hidden = !EZ.store.data.settings.mirror;
        this.el.hudGap.hidden = false;
      }
    },
    refreshTitle() {
      const d = EZ.store.data;
      this.el.bestDist.textContent = EZ.fmt.dist(d.bestDist);
      this.el.bestUnit.textContent = EZ.fmt.distUnit();
      this.el.titleControls.textContent = EZ.touch
        ? 'Swipe to change lanes, up to hop, down to ride low. Flick up and sideways to barrel-roll. Hold anywhere to launch.'
        : 'Arrows or WASD to drive. Up hops, down rides low, Q and E barrel-roll. Shift launches. Esc pauses.';
    },

    // ---------------------------------------------------------------- settings
    bindSettings() {
      const s = () => EZ.store.data.settings;
      const sync = () => {
        $('setSound').checked = s().sound;
        $('setVolume').value = s().volume;
        $('setMusic').value = s().music;
        $('setMirror').checked = s().mirror;
        $('setShake').checked = s().shake;
        $('setHaptics').checked = s().haptics;
        for (const b of $('setQuality').children) b.setAttribute('aria-checked', String(b.dataset.v === s().quality));
        for (const b of $('setUnits').children) b.setAttribute('aria-checked', String(b.dataset.v === s().units));
      };
      this.syncSettings = sync;
      const save = () => { EZ.store.save(); EZ.Audio.applySettings(); this.g.applySettings(); sync(); };
      $('setSound').addEventListener('change', (e) => { s().sound = e.target.checked; save(); });
      $('setVolume').addEventListener('input', (e) => { s().volume = parseFloat(e.target.value); save(); });
      $('setMusic').addEventListener('input', (e) => { s().music = parseFloat(e.target.value); save(); });
      $('setMirror').addEventListener('change', (e) => { s().mirror = e.target.checked; save(); });
      $('setShake').addEventListener('change', (e) => { s().shake = e.target.checked; save(); });
      $('setHaptics').addEventListener('change', (e) => { s().haptics = e.target.checked; save(); });
      for (const [id, key] of [['setQuality', 'quality'], ['setUnits', 'units']]) {
        $(id).addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          s()[key] = b.dataset.v;
          save();
          this.refreshTitle();
        });
      }
      if (!('vibrate' in navigator)) $('hapticsField').hidden = true;
      sync();
    },
    openSettings() {
      this.syncSettings();
      this.el.settings.hidden = false;
      setTimeout(() => $('btnSettingsDone').focus({ preventScroll: true }), 30);
    },
    closeSettings() {
      this.el.settings.hidden = true;
      if (!this.el.title.hidden) $('btnSettings').focus({ preventScroll: true });
      else if (!this.el.pause.hidden) $('btnPauseSettings').focus({ preventScroll: true });
    },
    settingsOpen() { return !this.el.settings.hidden; },

    // ---------------------------------------------------------------- paint shop
    buildSwatches() {
      const d = EZ.store.data, miles = d.totalDist / EZ.C.MILE;
      const ul = this.el.swatches;
      ul.innerHTML = '';
      this.el.totalDist.textContent = `${EZ.fmt.dist(d.totalDist)} ${EZ.fmt.distUnit()}`;
      const describe = (p) => {
        if (miles >= p.unlock) return p.name;
        const left = (p.unlock - miles) * (EZ.store.data.settings.units === 'kmh' ? 1.609 : 1);
        return `${p.name}. Drive ${left.toFixed(1)} ${EZ.fmt.distUnit()} more to unlock.`;
      };
      for (const p of EZ.PAINTS) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.className = 'swatch';
        b.style.setProperty('--chip', p.color);
        b.setAttribute('aria-label', describe(p));
        b.setAttribute('aria-pressed', String(d.paint === p.id));
        const locked = miles < p.unlock;
        b.disabled = locked;
        b.title = describe(p);
        b.addEventListener('click', () => {
          d.paint = p.id;
          EZ.store.save();
          this.g.player.setPaint(p.id);
          for (const x of ul.querySelectorAll('.swatch')) x.setAttribute('aria-pressed', 'false');
          b.setAttribute('aria-pressed', 'true');
          this.el.paintName.textContent = p.name;
          EZ.Audio.click();
        });
        b.addEventListener('mouseenter', () => { this.el.paintName.textContent = describe(p); });
        b.addEventListener('focus', () => { this.el.paintName.textContent = describe(p); });
        li.appendChild(b);
        ul.appendChild(li);
      }
      this.el.paintName.textContent = EZ.paintById(d.paint).name;
    },

    // ---------------------------------------------------------------- HUD
    set(key, el, value, prop = 'textContent') {
      if (this.cache[key] === value) return;
      this.cache[key] = value;
      el[prop] = value;
    },
    cls(key, el, name, on) {
      const k = key + name;
      if (this.cache[k] === on) return;
      this.cache[k] = on;
      el.classList.toggle(name, on);
    },
    hud(g, dt) {
      this.lastHud += dt;
      if (this.lastHud < 1 / 20) return;
      this.lastHud = 0;
      const p = g.player, r = g.run, E = this.el;
      this.set('mlab', this.markerLabel, EZ.fmt.markerLabel());
      this.set('mile', E.hudMile, EZ.fmt.dist(p.s));
      this.set('spd', E.hudSpeed, String(EZ.fmt.speed(p.speed)));
      this.set('unit', E.hudUnit, EZ.fmt.speedUnit());
      this.set('score', E.hudScore, EZ.fmt.int(r.score));
      this.set('mult', E.hudMult, `×${r.mult.toFixed(1)}`);
      this.cls('mult', E.hudMult, 'is-idle', r.mult <= 1.001);
      const gapText = p.jammer > 0 ? 'Radar jammed' : r.gap >= EZ.C.GAP_MAX - 0.5 ? 'Cruisers holding back' : `Cruiser ${EZ.fmt.near(r.gap)} back`;
      this.set('gap', E.hudGap, gapText);
      this.cls('gap', E.hudGap, 'is-close', r.gap < 16);
      const hot = r.gap < 18 && g.flashColor;
      this.cls('mirror', E.mirror, 'is-hot', !!hot);
      this.cls('mirror', E.mirror, 'is-blue', g.flashColor === 'blue');
      const b = Math.max(0, p.battery);
      this.set('chg', E.chargeFill.style, `scaleX(${(b / 100).toFixed(3)})`, 'transform');
      this.set('chgp', E.chargePct, `${Math.ceil(b)}%`);
      this.cls('chg', E.charge, 'is-low', b < 30 && b >= 12);
      this.cls('chg', E.charge, 'is-critical', b < 12);
      this.cls('chg', E.charge, 'is-charging', !!(g.ch && g.ch.charging));
      this.hopPips.forEach((pip, i) => this.cls('hop' + i, pip, 'is-ready', i < p.hops));
      this.cls('hops', E.hops, 'is-emp', p.emp > 0);
      E.launchFill.style.setProperty('--fill', `${Math.round((p.boosting > 0 ? p.boosting / EZ.C.BOOST_TIME : p.boost) * 100)}%`);
      this.cls('launch', E.btnLaunch, 'is-ready', p.boost >= 1 && p.boosting <= 0);
      this.cls('launch', E.btnLaunch, 'is-active', p.boosting > 0);
      this.cls('bump', E.bumper, 'is-on', g.state === 'run' && r.gap <= EZ.C.BUMPER);
      this.cls('fl', E.flankL, 'is-on', g.police.side < 0);
      this.cls('fr', E.flankR, 'is-on', g.police.side > 0);
      this.cls('spot', E.spotGlare, 'is-on', g.police.lit);
      this.powerups(p);
    },
    powerups(p) {
      const list = [
        ['coil', 'Volt coil', p.coil, 9],
        ['jammer', 'Radar jammer', p.jammer, 10],
        ['hover', 'Cold-gas hover', p.hover, 6],
        ['shield', 'Deflector', p.shield > 0 ? 1 : 0, 1],
      ].filter((x) => x[2] > 0);
      const key = list.map((x) => x[0]).join(',');
      if (this.cache.pu !== key) {
        this.cache.pu = key;
        this.el.powerups.innerHTML = list.map((x) => `<div class="pu" data-k="${x[0]}"><span class="pu-ring"></span>${x[1]}</div>`).join('');
      }
      for (const x of list) {
        const el = this.el.powerups.querySelector(`[data-k="${x[0]}"]`);
        if (el) el.style.setProperty('--p', (x[2] / x[3]).toFixed(3));
      }
    },
    // crosswind warning on the windward side; 0 hides it
    gust(dir) {
      const el = this.el.gust;
      if (!el) return;
      el.classList.toggle('is-on', dir !== 0);
      if (dir) {
        el.classList.toggle('is-left', dir > 0);
        el.classList.toggle('is-right', dir < 0);
      }
    },
    // a shake of the Launch diamond when it's pressed before it's full
    denyLaunch() {
      const el = this.el.btnLaunch;
      el.classList.remove('is-denied');
      void el.offsetWidth;
      el.classList.add('is-denied');
    },
    emp() {
      const el = this.el.empFx;
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
    },
    pop(text, kind = 'info') {
      const box = this.el.pops;
      while (box.children.length > 2) box.firstChild.remove();
      const d = document.createElement('div');
      d.className = `pop pop--${kind}`;
      d.textContent = text;
      box.appendChild(d);
      setTimeout(() => d.remove(), 1150);
    },
    radio(who, text) {
      const box = this.el.dispatch;
      const d = document.createElement('p');
      d.className = 'radio';
      const b = document.createElement('b');
      b.textContent = who;
      d.appendChild(b);
      d.appendChild(document.createTextNode(text));
      box.appendChild(d);
      while (box.children.length > 2) box.firstChild.remove();
      setTimeout(() => d.classList.add('is-old'), 4600);
      setTimeout(() => d.remove(), 5300);
    },
    // the speed sign grows while the thrusters take the car to sixty, then flashes as it gets there
    speedLaunch(on) {
      const el = this.el.speedSign;
      el.classList.toggle('is-launch', on);
      if (on) { el.classList.remove('is-sixty'); return; }
      void el.offsetWidth;
      el.classList.add('is-sixty');
    },

    // Google Play Games, Android only: the title button opens the leaderboard once you're signed in,
    // and is a sign-in button before that
    playStatus(p) {
      this.el.btnPlay.hidden = !p.available || (p.signedIn && !p.leaderboard);
      this.el.btnPlay.textContent = p.signedIn ? 'Leaderboard' : 'Sign in to Play Games';
      this.el.playField.hidden = !p.available;
      this.el.playName.textContent = p.signedIn ? `Signed in as ${p.name || 'a player'}` : p.failed ? "Couldn't sign in. Try again." : 'Not signed in';
      this.el.btnPlaySignIn.hidden = p.signedIn;
    },

    // the ring that fills round a finger held still to Launch; null hides it
    holdRing(x, y, ms) {
      const el = this.el.holdRing;
      if (x == null) { el.hidden = true; return; }
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.setProperty('--fill', `${ms}ms`);
      el.classList.toggle('is-ready', this.g.player.boost >= 1);
      el.hidden = false;
      el.classList.remove('is-filling');
      void el.offsetWidth;
      el.classList.add('is-filling');
    },

    // ---------------------------------------------------------------- controls
    controls() { return EZ.touch ? CONTROLS.touch : CONTROLS.keys; },
    buildControls() {
      const list = this.el.ctlList;
      list.innerHTML = this.controls().map(([, k, how, what]) => `<div class="ctl"><b class="ctl-key">${k}</b><span class="ctl-text"><strong>${what}</strong>${how}</span></div>`).join('');
      this.el.ctlPad.hidden = EZ.touch;
    },
    // recording mode: pick the set piece that comes next, then straight back to the road
    buildRecordPick() {
      if (!EZ.record) return;
      this.el.pause.classList.add('is-record');
      this.el.recordPick.hidden = false;
      this.el.recordGrid.innerHTML = RECORD.map(([z, name]) => `<button class="sign sign--yellow sign-btn" data-z="${z}">${name}</button>`).join('');
      this.el.recordGrid.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        EZ.Audio.click();
        this.g.ents.planner.queue(b.dataset.z);
        this.g.resume();
      });
    },
    // first runs: the four driving moves in a strip under the car; each one ticks off once you've used it
    quickstart(show) {
      const el = this.el.quick;
      clearTimeout(this.quickHide);
      this.el.hud.classList.toggle('is-quick', show);
      if (!show) {
        this.quickLeft = null;
        el.classList.add('is-out');
        this.quickHide = setTimeout(() => { el.hidden = true; }, 450);
        return;
      }
      const moves = this.controls().filter(([kind]) => QUICK.includes(kind));
      this.el.quickRow.innerHTML = moves.map(([kind, k, , what]) => `<div class="quick-chip" data-k="${kind}"><b>${k}</b><span>${what}</span></div>`).join('');
      this.el.quickCap.textContent = EZ.touch ? 'Swipe anywhere to drive' : 'Drive with the arrow keys';
      this.quickLeft = new Set(QUICK);
      el.classList.remove('is-out');
      el.hidden = false;
    },
    // true once every move in the strip has been tried
    quickUsed(kind) {
      if (!this.quickLeft || !this.quickLeft.delete(kind)) return false;
      const chip = this.el.quickRow.querySelector(`[data-k="${kind}"]`);
      if (chip) chip.classList.add('is-done');
      return this.quickLeft.size === 0;
    },

    // ---------------------------------------------------------------- citation
    citation(c) {
      const E = this.el;
      E.tNo.textContent = c.no;
      E.tVehicle.textContent = c.vehicle;
      E.tCharge.textContent = c.charge;
      E.tLoc.textContent = c.location;
      E.tDist.textContent = c.dist;
      E.tTop.textContent = c.top;
      E.tNear.textContent = c.near;
      E.tVolts.textContent = c.volts;
      E.tWrecks.textContent = c.wrecks;
      E.tTime.textContent = c.time;
      E.tScore.textContent = c.score;
      E.tOfficer.textContent = c.officer;
      E.tBest.innerHTML = '';
      if (c.record) {
        const s = document.createElement('span');
        s.className = 'is-record';
        s.textContent = 'New personal best. ';
        E.tBest.appendChild(s);
        E.tBest.appendChild(document.createTextNode(`Previous best ${c.prevBest}.`));
      } else {
        E.tBest.textContent = `Personal best ${c.best}.`;
      }
      E.tUnlock.hidden = !c.unlock;
      E.tUnlock.textContent = c.unlock ? `Paint unlocked: ${c.unlock}. Pick it in the paint shop.` : '';
      this.screen('citation');
    },
  });
})();
