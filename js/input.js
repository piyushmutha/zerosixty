/* Zero Sixty: keyboard, swipe and gamepad. Everything becomes a named action for the game. */
(function () {
  'use strict';
  const EZ = window.EZ;

  const KEYS = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'hop', w: 'hop', W: 'hop', ' ': 'hop',
    ArrowDown: 'duck', s: 'duck', S: 'duck',
    q: 'rollL', Q: 'rollL', e: 'rollR', E: 'rollR',
    Shift: 'boost', f: 'boost', F: 'boost',
    Escape: 'pause', p: 'pause', P: 'pause',
    Enter: 'confirm',
  };

  EZ.Input = {
    init(game) {
      this.g = game;
      this.ptr = null;
      this.lastTap = 0;
      this.pads = {};
      window.addEventListener('keydown', (e) => this.key(e, true));
      window.addEventListener('keyup', (e) => this.key(e, false));
      const el = document.getElementById('gl');
      el.addEventListener('pointerdown', (e) => this.down(e));
      window.addEventListener('pointermove', (e) => this.move(e));
      window.addEventListener('pointerup', (e) => this.up(e));
      window.addEventListener('pointercancel', () => { this.ptr = null; });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    key(e, down) {
      const a = KEYS[e.key];
      if (!a) return;
      const driving = this.g.inRun();
      const tag = e.target && e.target.tagName;
      // menus keep native keyboard behaviour for buttons, sliders and switches
      if (!driving && (tag === 'BUTTON' || tag === 'INPUT') && a !== 'pause') return;
      if (driving) e.preventDefault();
      if (down) {
        if (e.repeat) return;
        this.g.action(a, 'key');
      } else if (a === 'duck') {
        this.g.action('duckUp', 'key');
      }
    },

    down(e) {
      if (!this.g.inRun()) return;
      e.preventDefault();
      EZ.Audio.resume();
      this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), swiped: false, lastDuck: false, lastDir: '', lastT: 0 };
    },
    move(e) {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      const th = Math.max(22, Math.min(window.innerWidth, window.innerHeight) * 0.045);
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      let dir;
      // a diagonal flick upward is a barrel roll to that side
      if (dy < 0 && ax > th * 0.55 && ay > th * 0.55 && ax < ay * 2.4 && ay < ax * 2.4) dir = dx < 0 ? 'rollL' : 'rollR';
      else if (ax > ay) dir = dx < 0 ? 'left' : 'right';
      else dir = dy < 0 ? 'hop' : 'duck';
      const now = performance.now();
      p.x = e.clientX;
      p.y = e.clientY;
      // one action per flick; the same direction again needs a short pause (a deliberate second swipe)
      if (dir === p.lastDir && now - p.lastT < 170) { p.lastT = now; return; }
      p.lastDir = dir;
      p.lastT = now;
      p.swiped = true;
      this.g.action(dir, 'touch');
      if (dir === 'duck') p.lastDuck = true;
    },
    up(e) {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      this.ptr = null;
      if (p.lastDuck) this.g.action('duckUp', 'touch');
      if (p.swiped || performance.now() - p.t > 260) return;
      const now = performance.now();
      if (now - this.lastTap < 330) { this.g.action('boost', 'touch'); this.lastTap = 0; }
      else this.lastTap = now;
    },

    poll() {
      if (!navigator.getGamepads) return;
      let pads;
      try { pads = navigator.getGamepads(); } catch (err) { return; }
      for (const gp of pads) {
        if (!gp) continue;
        const st = this.pads[gp.index] || (this.pads[gp.index] = { b: [], ax: 0, ay: 0 });
        const pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
        const edge = (i, a, upA) => {
          const v = pressed(i);
          if (v && !st.b[i]) this.g.action(a, 'pad');
          if (!v && st.b[i] && upA) this.g.action(upA, 'pad');
          st.b[i] = v;
        };
        edge(14, 'left'); edge(15, 'right'); edge(12, 'hop'); edge(13, 'duck', 'duckUp');
        edge(0, 'hop'); edge(1, 'duck', 'duckUp'); edge(2, 'boost'); edge(7, 'boost'); edge(9, 'pause');
        edge(4, 'rollL'); edge(5, 'rollR');
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        const sx = ax < -0.55 ? -1 : ax > 0.55 ? 1 : 0;
        if (sx !== st.ax && sx !== 0) this.g.action(sx < 0 ? 'left' : 'right', 'pad');
        st.ax = sx;
        const sy = ay < -0.6 ? -1 : ay > 0.6 ? 1 : 0;
        if (sy !== st.ay) {
          if (sy < 0) this.g.action('hop', 'pad');
          else if (sy > 0) this.g.action('duck', 'pad');
          else if (st.ay > 0) this.g.action('duckUp', 'pad');
        }
        st.ay = sy;
      }
    },
  };
})();
