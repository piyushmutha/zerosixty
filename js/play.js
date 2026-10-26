/* Zero Sixty: Google Play Games in the Android app. Sign-in happens by itself at launch; this keeps
   the title screen and settings in step with it and sends each run's score to the leaderboard.
   On the web, or before the game is set up in Play Console, it stays out of the way. */
(function () {
  'use strict';
  const EZ = window.EZ;
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const P = native && cap.Plugins && cap.Plugins.PlayGames;

  EZ.Play = {
    available: false,
    signedIn: false,
    leaderboard: false,
    name: '',
    failed: false,
    async refresh() {
      if (!P) return;
      try { Object.assign(this, await P.status()); } catch (e) { /* treated as signed out */ }
      EZ.UI.playStatus(this);
    },
    async signIn() {
      if (!P) return;
      try { Object.assign(this, await P.signIn()); } catch (e) { this.signedIn = false; }
      this.failed = !this.signedIn;
      EZ.UI.playStatus(this);
    },
    submit(score) {
      if (P && this.signedIn && this.leaderboard && score > 0) P.submitScore({ score: Math.round(score) }).catch(() => {});
    },
    show() {
      if (P && this.signedIn) P.showLeaderboard().catch(() => {});
    },
  };
})();
