# Zero Sixty on Google Play

Everything Play Console asks for, in the order it asks.

## 1. Create app

| Field | Answer |
| --- | --- |
| App name | Zero Sixty: Police Chase |
| Default language | English (United States) – en-US |
| App or game | Game |
| Free or paid | Free (this can't be changed to paid later) |
| Declarations | Tick Developer Program Policies and US export laws, after reading them |

## 2. Store listing (Grow users > Store presence > Main store listing)

**App name** (24/30)

```
Zero Sixty: Police Chase
```

**Short description** (77/80)

```
Hit sixty in 0.8 seconds, then outrun the highway patrol in an endless chase.
```

**Full description** (1,578/4,000)

```
Sixty in 0.8 seconds. Now lose the cops.

Zero Sixty is an endless highway pursuit. You drive an electric hypercar with cold-gas thrusters and suction fans, and the highway patrol wants it back. Every run starts from a standstill with a launch to sixty in under a second. Then it's three lanes of traffic, roadblocks and stunts for as long as you can stay ahead.

STUNTS THE CAR WAS BUILT FOR
• Thruster hops over barriers and spike strips
• Barrel rolls over cars that box you in, and over a rolling police roadblock
• Ride low under trailers and low-clearance bars
• Drive up the wall of a suction tube and race along its ceiling upside down
• Climb a car carrier's ramp and launch off the cab
• Fire the Launch boost toward 240 mph when the meter is full

A CHASE THAT FIGHTS BACK
• Cruisers pull alongside to try a PIT manoeuvre. Lure them into obstacles to wreck them
• A helicopter sweeps its spotlight over you after dark
• Drones drop EMP mines that knock your thrusters out
• Crosswinds, cargo spills, toll plazas and a wireless charging lane
• Keep the battery topped up with charge cells, or the run is over

FOUR STRETCHES OF ROAD
Drive from the Pacific coast at golden hour, through the Mojave at dusk and downtown at night, to the Sierra at dawn. The soundtrack is generated live and builds as the cruisers close in.

MADE FOR PHONES
Swipe to change lanes, hop, ride low and roll. It plays offline, needs no account, has no ads and nothing to buy. Unlock new paint colours as you drive, and end every run with a hand-written ticket from the officer who caught you.
```

**Graphics** (all in this folder)

| Asset | File | Play's requirement |
| --- | --- | --- |
| App icon | `play-icon-512.png` | 512 × 512 PNG |
| Feature graphic | `feature-graphic-1024x500.jpg` | 1024 × 500, JPEG or PNG without alpha |
| Phone screenshots | `screenshots/01-launch.jpg` … `07-title.jpg` | 2–8, 9:16; 1080 × 1920 makes them eligible for promotion |

The screenshots are in the order to upload them. The title screen's "Best 8.3 mi" and the ticket's "Personal best" come from a seeded save so the profile doesn't look empty; everything else is gameplay as it renders.

**Preview video** (optional, recommended for games): a YouTube link. The clips in `marketing/videos` would work once uploaded to YouTube.

**Category and contact** (Store settings)

| Field | Answer |
| --- | --- |
| App category | Game > Racing |
| Tags | Pick from Play's list, e.g. Racing, Driving, Arcade, Casual |
| Email | Required and shown publicly. Use one you're happy to publish |
| Website | https://piyushmutha.github.io/zerosixty/ |
| Privacy policy | https://piyushmutha.github.io/zerosixty/privacy.html |

The listing must not mention Tesla or use other brands; the text above doesn't.

## 3. App content (Policy and programs > App content)

| Declaration | Answer |
| --- | --- |
| Privacy policy | https://piyushmutha.github.io/zerosixty/privacy.html |
| Sign in details (was App access) | No. Play Games sign-in is automatic and optional; nothing needs an account or a payment |
| Ads | No, the app doesn't contain ads |
| Content rating | Fill in the IARC questionnaire honestly: a game; vehicles crash and police cars get wrecked, but there are no people shown hurt, no blood, no weapons, no gambling, no user chat and no purchases. Expect the lowest or near-lowest rating |
| Target audience | 13–15, 16–17 and 18+. Leaving out under-13s keeps the app out of the Families programme and its extra rules |
| Appeals to children | No |
| News app | No |
| Data safety | See below |
| Advertising ID | No. The app doesn't use it, and no library adds the permission |
| Government app | No |
| Financial features | None |
| Health | None |

**Data safety, with Play Games sign-in** (answered this way from the start, since sign-in follows in the next build). The game itself collects nothing; everything below is what the Play Games SDK collects, per Google's [Play Games data disclosure](https://developer.android.com/games/pgs/data-collection). You're responsible for the final answers.

| Question | Answer |
| --- | --- |
| Collects or shares required data types | Yes |
| Encrypted in transit | Yes (Play Games uses HTTPS) |
| Account creation | My app does not allow users to create an account (the Play Games profile is Google's) |
| Can users log in with accounts created outside the app? | Yes. How: Other (a Google Play Games profile) |
| Can users request that their data is deleted? | Yes. Play Games data is deleted from the Play Games profile, and progress on the device by uninstalling. Delete data URL: https://piyushmutha.github.io/zerosixty/privacy.html#delete-your-data |
| Personal info > User IDs | Collected, not shared, optional. Purposes: App functionality, Account management |
| App activity > Other actions (game scores) | Collected, not shared, optional. Purpose: App functionality |
| App info and performance > Diagnostics | Collected, not shared, required. Purpose: Analytics (the SDK's own stability data) |

Data is collected only through Play Games, so none of it is processed ephemerally. Players delete it from their Play Games profile or Google Account.

If the target audience includes under-13s, the Families policy applies and sign-in would need a neutral age screen, so keep the audience at 13 and over.

## 4. First release: closed testing

New personal developer accounts must run a **closed test with at least 12 testers opted in for 14 days in a row** before they can apply for production access ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465)).

1. Build the bundle: `npm run android:aab` produces `dist/ZeroSixty.aab`, signed with the upload key.
2. **Test and release > Testing > Closed testing**: create a track, add testers (an email list or a Google Group), and pick the countries.
3. Create a release and upload `dist/ZeroSixty.aab`. When asked about app signing, let Google create and manage the app signing key (Play App Signing). Your keystore stays the upload key; keep it backed up.
4. Release notes, for example: `First test release.`
5. Send testers the opt-in link. They must opt in and install, and stay opted in for the full 14 days.
6. After 14 days with 12 or more testers: **Dashboard > Apply for production**.

Every later upload needs a higher `versionCode` in `android/app/build.gradle`.

After the first upload, **Test and release > App integrity > App signing** shows Google's app signing certificate. Its SHA-1 is the second credential Play Games needs (see the README).
