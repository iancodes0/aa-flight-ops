# AA Flight Ops Discord bot

Discord bot and pilot dashboard for community flight logs, OAuth sign-in, flight-plan review, and basic anti-spam/profanity moderation.

## Requirements

- Node.js 18.17 or newer
- A Discord application and bot token
- A server where you can invite/manage bots
- PM2 (included as a project dependency)

## Configure the bot

1. Run `npm install` in this project.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, and the other server values. **Never put the client secret or bot token in the website. Never commit or share `.env`.**
3. In the Discord Developer Portal, enable the **Message Content Intent** for AutoMod. Invite the bot with `applications.commands` and `bot` scopes and grant it View Channels, Send Messages, Embed Links, Attach Files, Manage Messages, Manage Channels, and Manage Roles permissions.
4. Start once with `npm start` to check that login and command registration succeed. Slash commands can take a short time to appear globally.

`/logflight` requires departure ICAO, arrival ICAO, aircraft, hours, and minutes. It accepts an optional image attachment and notes. `/faq` creates a private channel visible to the requester and server roles with Manage Messages; it explains that FAQ is under development. `/claimroles` is restricted to the configured server and users with Manage Roles, and assigns the requester every non-managed role below the bot's highest role. The bot needs Manage Channels to create that channel and Manage Roles to use `/claimroles`.

AutoMod removes matches for a small configurable profanity list and removes more than five messages within seven seconds. Discord message deletion is permission-dependent. Edit `PROFANITY` and the spam window/limit in `bot/index.js` to tune it. Staff with Manage Messages are exempt.

## Keep it online with PM2

Run from this directory on the always-on host:

```sh
npm run pm2:start
npx pm2 save
npx pm2 startup
```

Run the command printed by `pm2 startup` on that host to enable boot-time startup, then run `npx pm2 save` again. Useful operations: `npm run pm2:status`, `npm run pm2:logs`, and `npm run pm2:restart`. PM2 requires a machine that remains powered on; it is not a cloud host by itself.

## Live pilot dashboard

The website accepts flight-plan requests without Discord sign-in. Optional Discord OAuth provides personal flight-plan status, moderator accept/deny actions, completed-flight history, hours, and nautical-mile totals. Requests are stored in `bot/data/flight-data.json`; back up that file in production.

There is no separate API project. The existing Node bot process includes the small backend needed for Discord login and flight-plan storage. GitHub Pages is only the frontend, so that same bot process must be reachable at a public HTTPS URL for the published site to use it. Set `window.AA_API_BASE` before `app.js` in `website/index.html` to that URL, for example:

When running locally, open `http://localhost:3001/`. The bot serves the dashboard and its backend from the same process.

```html
<script>window.AA_API_BASE = 'https://api.example.com';</script>
<script src="app.js"></script>
```

The API host must set `WEBSITE_API_ORIGIN=https://iancodes0.github.io`, and the Discord application OAuth redirect URI must exactly match `DISCORD_REDIRECT_URI=https://iancodes0.github.io/aa-flight-ops/`. GitHub Pages cannot call `127.0.0.1`, so the local default is intended only for testing on the same machine as the bot. The published site also needs `window.AA_API_BASE` set to the public HTTPS address of the running bot API; GitHub Pages cannot serve the Node API itself.

Render deployment is configured in `render.yaml`. Create a Render Blueprint from this repository, enter the two secret Discord values, and deploy the `aa-flight-ops-api` service. Its public URL is `https://aa-flight-ops-api.onrender.com`.

The UI is American Airlines-inspired but uses its own abstract wing graphic and is not affiliated with or endorsed by American Airlines.

## CesiumJS 3D globe

The standalone globe is available at `website/globe.html`. It loads CesiumJS from
the Cesium CDN and uses a Cesium Ion token for World Terrain and imagery.

1. Copy `website/globe-config.example.js` to `website/globe-config.js`.
2. Set `window.CESIUM_ION_ACCESS_TOKEN` in `website/globe-config.js` to a token
   created at [Cesium Ion](https://ion.cesium.com/).
3. Open `website/globe.html` through a local web server, not directly with
   `file://`. For example:

   ```sh
   npx serve website
   ```

The token must be present in the browser, so it is not a server secret. In the
Cesium Ion dashboard, restrict it to the domains where the globe is deployed
and limit its allowed assets. The real `website/globe-config.js` is ignored by
Git and must never be committed.

### Aircraft physics

`website/aircraft-physics.js` provides the browser-global `AircraftPhysics`
class. It uses meters, seconds, and radians. Coordinates are `{ x, y, z }`,
with `z` upward; `heading` is measured from the x-axis. Thrust is a value from
0 to 1:

```js
const aircraft = new AircraftPhysics({
  position: { x: 0, y: 0, z: 1_000 },
  heading: 0
});

const state = aircraft.update(1 / 60, {
  pitch: 0.05,
  roll: 0,
  thrust: 0.7
});
console.log(state.position, state.velocity);
```

The class applies thrust, quadratic drag, and gravity, and is loaded by
`website/globe.html` before `globe.js`.

The globe demo creates an aircraft entity using Cesium's sample `.glb` model
and updates its Cesium position and orientation from the physics state on every
clock tick. You can change the live inputs in the browser console:

```js
aircraftInputs.pitch = 0.1;
aircraftInputs.roll = 0.05;
aircraftInputs.thrust = 0.8;
```

Replace the `uri` in `website/globe.js` with a path such as
`models/airplane.glb` when you add your own model. The model should point
forward along its local +X axis for the default orientation mapping.

Keep Discord bot tokens, OAuth client secrets, and other private API keys in
the root `.env` file. Those values must never be placed in `website/` or in
browser JavaScript.
