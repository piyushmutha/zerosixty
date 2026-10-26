# Zero Sixty

An endless highway pursuit. You drive the Roadster, the highway patrol wants it back. It does sixty in 0.8 seconds, and every run starts by proving it.

It runs in any modern browser on phones, tablets and desktops. There is no backend and no build step: just static files.

## Play

**Play it in your browser at [piyushmutha.github.io/zerosixty](https://piyushmutha.github.io/zerosixty/).** It's served by GitHub Pages straight from the `main` branch, so every push to `main` updates it.

To run it locally, open `index.html` in a browser. That's it.

If your browser blocks local files, or to test on a phone over Wi-Fi, serve the folder with any static server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` (or your computer's IP on the phone).

To publish it somewhere else, upload the folder to any static host (Netlify, Cloudflare Pages, S3). Over HTTPS the game installs as an app and keeps working offline after the first visit.

Nothing is fetched from the internet: Three.js and the two typefaces are bundled in `vendor/` (a CDN copy of Three.js is only a fallback). Every model, texture and sound is generated in code.

## Android app

`npm run android:apk` (below) builds a signed release APK at `dist/ZeroSixty.apk`. Build output isn't kept in the repository. Copy the APK to an Android phone (Android 7 or later) and open it. Android will ask you to allow installs from that source the first time.

The app id is `com.zerosixty.game`. Builds from before the rename (named Exit Zero, `com.exitzero.roadster`) are a separate app as far as Android is concerned: uninstall that one, since it won't update to this.

The app runs the same game full screen, keeps the screen awake while it's open, and works offline. The back button pauses a run and steps out of menus.

To rebuild after changing the game:

```bash
npm run android:apk
```

That copies the game into `www/`, syncs it into the Capacitor project in `android/`, and builds with the portable JDK and Android SDK in `D:\Android-toolchain`. To open the project in Android Studio instead, run `npx cap open android`.

**Keep the signing key.** Updates to an installed app must be signed with the same key. It lives at `D:\Android-toolchain\keys\exit-zero-release.jks`, and its password is in `android/keystore.properties`. Back both up somewhere safe and don't share them. To publish on Google Play you'd build an app bundle (`gradlew bundleRelease`) and use Play App Signing.

## Google Play Games sign-in

The Android app signs players in to Google Play Games by itself when it opens, with no sign-in screen. Once signed in, every run's score goes to a **High score** leaderboard, and a **Leaderboard** button appears on the title screen. If the automatic sign-in doesn't go through, that button reads **Sign in to Play Games** instead. Settings shows who's signed in. The web version has no sign-in.

It stays switched off until the game is set up in Play Console, and until then the app plays exactly as before. To switch it on:

1. In Play Console, create the app (as a game) for the package `com.zerosixty.game`.
2. Go to **Grow users > Play Games Services > Setup and management > Configuration**, choose *No, my game doesn't use Google APIs*, and create the project. Copy the **Project ID** shown under the game's name.
3. Under **Credentials**, set up the OAuth consent screen when asked (it opens Google Cloud), then **Add credential > Android** for `com.zerosixty.game`. Add one credential per signing certificate:
   - APKs you build and install yourself are signed with the upload key: SHA-1 `E9:75:82:DF:C4:B3:26:6B:23:4A:99:CC:60:22:FA:24:E3:38:67:F8`.
   - Copies installed from Google Play are signed by Google: copy the SHA-1 from **Test and release > App integrity > App signing**.
4. Under **Leaderboards**, create one called **High score**: numeric, no decimal places, larger is better. Copy its ID.
5. Under **Testers**, add your Google account. Until the game is published, only testers can sign in.
6. Put both IDs in `android/app/src/main/res/values/play_games.xml`, then run `npm run android:apk`.
7. Before releasing to everyone: publish the OAuth consent screen in Google Cloud, then click **Publish** on the Play Games Services page, **before** you publish the app itself.

The native side is `PlayGamesPlugin.java` and `ZeroSixtyApp.java` in `android/app/src/main/java/com/zerosixty/game/`, and the game side is `js/play.js`.

## Controls

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Change lanes | ← → or A D | Swipe left or right | D-pad or left stick |
| Thruster hop | ↑, W or Space | Swipe up | A |
| Barrel roll left / right | Q / E | Flick up-left / up-right | LB / RB |
| Ride low | ↓ or S (hold to stay low) | Swipe down | B |
| Launch boost | Shift or F | Hold a finger still anywhere, or tap the yellow diamond | X or RT |
| Pause | Esc or P | Pause button | Start |

The same list is in the game: Settings on the title screen, or Controls & settings in the pause menu.

## Recording mode

For filming the game, add `?record` to the address: [piyushmutha.github.io/zerosixty/?record](https://piyushmutha.github.io/zerosixty/?record), or `index.html?record` locally.

- The first-run controls strip and the training hop and low-bar stay off.
- The pause menu lists the set pieces: car carrier, suction tube, rolling roadblock, toll plaza, police drones, crosswinds, cargo spill and the charging lane. Tap one and the run carries on, with that set piece next once the road already laid out ahead runs out: about 20 to 30 seconds.

Everything else plays as normal, and runs still count towards your best and the paint unlocks. The Android app has no address bar, so this is web only.

## The start

Every run starts on the line with the cruisers right behind you. For a moment the motors wind up against the brakes, the car squats and the tyres smoke. Then the rear thrusters fire and it's sixty in about 0.8 seconds, and they keep pushing to cruising speed: a thump, speed lines, the camera falling back and widening as the speed builds, and the speed sign swelling as it counts up and flashing yellow at sixty.

From there the car never drops below 60 mph. Scrapes and spike strips slow it down to sixty and no further; only a dying battery takes it lower.

On your first runs the four driving moves sit in a strip under the car, where they don't hide the road ahead. Each one ticks off once you've used it, and the strip goes when you've tried them all. After that the full list lives in the Controls & settings panel: **Settings** on the title screen, **Controls & settings** in the pause menu.

## What the Roadster can do

The car follows what Tesla showed when it revealed the Roadster on October 15, 2026: suction fans under the floor, ten cold-gas thrusters fed by compressed-air tanks, and a 0.81 s 0-60 mph run.

- **Thruster launch.** Every run starts with the rear thrusters lit: about 0.81 s to sixty from the moment you go. Launch fires them again: about four seconds at a third over your cruising speed (over 240 mph late in a run), easing off at the end.
- **Barrel roll.** Side thrusters flip the car over the next lane and land it up to two lanes across. Use it to roll over a car that boxes you in.
- **Suction tube.** Drive into the steel tube: the fans grip the wall, the car climbs it, and you drive along the ceiling upside down collecting charge. At the end it drops, the thrusters roll it upright, it hovers and touches down in a cloud of smoke. Left and right choose the lane you land in.
- **Spaceship landings.** Fall from any height (end of a hover, a roof bounce) and the belly thrusters catch the car and set it down softly.
- **Air charges.** Hops and rolls each use one of three air charges (the pips marked Air). The car's compressor refills them.
- **Details on the car.**
  - **Body:** lofted from cross-sections. The front fenders crown above a dipped bonnet, the waist pinches, wide haunches sit over the rear wheels, and the tail is rounded with a fan-feeding scoop in each flank.
  - **Canopy:** a gold-tinted glass teardrop framed by body-coloured A-pillars, roof rails and a targa hoop.
  - **Lights and wing:**
    - Swept almond-shaped headlamps on the leading edge of each front fender, in the manner of the Roadster prototype and the Rimac Nevera: black-chrome housings, an LED blade along the top edge that hooks round the outer end, three projectors, amber turn signals below.
    - A wide dark smile of an intake underneath, a full-width rear light bar, and an active airfoil wing that rises for grip and flattens at speed.
  - **Rear fans:** two ducted turbofans in carbon nacelles in the rear fascia, with spinning rotors and stators, glowing as they pull.
  - **Wheels:** round-shouldered tyres with tread grooves, rims with five pairs of spokes, cross-drilled discs and red calipers.
  - **Ano White paint** by default, other paints in the shop.

## How it plays

- The road is a three-lane, one-way highway. Traffic is slowest in the right lane and fastest on the left.
- The lead cruiser's distance shows under the rear-view mirror. Scrapes, spikes, EMP mines and toll arms all cost you some of it, and it recovers while you drive clean. One hit never ends a run from a safe distance: at worst it puts the cruiser on your bumper, with a red glow from behind and a warning. A second hit while it's that close and you're boxed in.
- Hitting something head-on ends the run, and so does letting the battery run flat. Charge cells (the yellow bolts) top it up.
- Crashes play out physically: a moment of slow motion, then the car tumbles, flips or barrel-rolls depending on what it hit and how fast, can lose a wheel, scatters paint, carbon and glass, and comes to rest on its wheels, roof or side with the hazard lights blinking. Whatever you hit is shoved, flipped or knocked loose. Getting caught is a PIT-style spin-out.
- The cold-gas thrusters hop you over barriers and spike strips.
- The air suspension drops the car just low enough to slide under low-clearance bars and jackknifed trailers.
- Close calls, clean hops, rolls, slides and ceiling runs build your multiplier and fill the Launch diamond.
- Cruisers pull alongside to try a PIT manoeuvre. Yellow chevrons flash on the side they come from, an alarm sounds as the cruiser draws level, and it holds there for a moment before it swerves: change lanes away, hop, or roll. On a phone the camera widens so you can see it. Lure one into an obstacle to wreck it.
- After dusk a helicopter sweeps its spotlight over you. Stay out of the light.
- Overhead message signs warn you about roadblocks, spike strips, lane closures and the set pieces below.

### Set pieces

Each one turns up once early in a run, in a different order every run after the first two, then joins the mix.

- **Car carrier.** A transporter with its rear deck tilted down to the road. Drive up the ramp, along the upper deck and off the headrack over the cab, then land on the thrusters.
- **Cargo spill.** A flatbed sheds crates and oil drums as you close in. The drums roll across to one side; one lane always stays clear.
- **Toll plaza.** Green arrows are open lanes. A red cross means the arm is down: ride low under it or hop it. Some lanes have a car stopped at the booth, and at higher difficulty an open arm slams down as you arrive.
- **Crosswinds.** A yellow GUST diamond appears on the windward side as a wall of dust rolls in. Ride low and the fans hold you in your lane; otherwise you're blown a lane over, or into the barrier.
- **Rolling roadblock.** Three cruisers abreast, slower than you, covering every lane. The way through is a barrel roll over the top.
- **Police drones.** Drones fly ahead and drop EMP mines: the target ring is red while a mine falls and pulses blue once it's armed. Change lanes or hop them. A hit knocks the thrusters out for a few seconds.
- **Wireless charging lane.** A glowing lane that tops up the battery and the Launch diamond while you stay on it, if the traffic lets you.
- Power-ups: Full charge, Volt coil (pulls in charge cells), Radar jammer, Deflector (shrugs off one crash), Cold-gas hover.
- The road runs through four regions in a loop, each with its own light: the Pacific coast at golden hour, the Mojave at dusk, downtown at night and the Sierra at dawn.
- The soundtrack is generated live and follows the chase: calm on the menus, driving once you launch, full tilt when the cruisers close in, during Launch and in the suction tube. The siren stays quiet until a cruiser is right behind you. Music and effects have separate volume sliders in Settings.
- Driving unlocks new paint colours in the Paint shop. Progress is saved in the browser.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `css/style.css` | Screens and HUD. The design language is road furniture: guide signs, regulatory plates, warning diamonds, a rest-area sign and a carbon-copy citation. |
| `js/core.js` | Helpers, tuning constants, regions, paints, save data |
| `js/geo.js` | Geometry merging and procedural textures |
| `js/models.js` | The Roadster, traffic, cruisers, hazards and scenery, built in code: sculpted side profiles with wheel arches, glass cabins, lamps ray-cast onto the bodywork |
| `js/world.js` | Sky, road, terrain, scenery, overhead signs, lighting per region |
| `js/entities.js` | Traffic and hazards, plus the planner that lays out a solvable road ahead |
| `js/player.js` | Driving model: lane-change spring, suspension, thruster hop and barrel roll, the suction-tube ride, thruster landings, air suspension |
| `js/police.js` | Chase cruisers, PIT attempts, the helicopter |
| `js/challenges.js` | Set pieces that play out over time: crosswind gusts, drones and EMP mines, the flatbed's falling load, closing toll arms, the charging lane |
| `js/audio.js` | Synthesised motor whine, wind, siren, rotor and sound effects |
| `js/music.js` | The soundtrack, generated live: calm on the menus, builds as the cruisers close in |
| `js/fx.js` | Tyre smoke, cold-gas vapour, sparks, boost streaks |
| `js/input.js`, `js/ui.js`, `js/game.js` | Input, interface, and the game loop |
| `js/play.js` | Google Play Games in the Android app: sign-in status and the leaderboard |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline cache and installable web app, with its icons |
| `art/`, `store/` | The logo artwork, and the Google Play icon and feature graphic made from it |
| `vendor/` | Bundled Three.js r149 (MIT) and the Overpass and Kalam fonts (SIL OFL), with their licences |
| `android/`, `capacitor.config.json`, `scripts/` | The Android app shell and the scripts that build it |

## License

[MIT](LICENSE) © 2026 Piyush Mutha. The bundled Three.js (MIT) and the Overpass and Kalam fonts (SIL Open Font License) keep their own licences, in `vendor/`.

This is a fan project. It is not affiliated with or endorsed by Tesla or SpaceX.
