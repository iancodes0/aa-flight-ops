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
3. In the Discord Developer Portal, enable the **Message Content Intent** for AutoMod. Invite the bot with `applications.commands` and `bot` scopes and grant it View Channels, Send Messages, Embed Links, Attach Files, Manage Messages, and Manage Channels permissions.
4. Start once with `npm start` to check that login and command registration succeed. Slash commands can take a short time to appear globally.

`/logflight` requires departure ICAO, arrival ICAO, aircraft, hours, and minutes. It accepts an optional image attachment and notes. `/faq` creates a private channel visible to the requester and server roles with Manage Messages; it explains that FAQ is under development. The bot needs Manage Channels to create that channel.

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

The website supports Discord OAuth sign-in, personal flight-plan status, moderator accept/deny actions, completed-flight history, hours, and nautical-mile totals. Requests are stored in `bot/data/flight-data.json`; back up that file in production.

There is no separate API project. The existing Node bot process includes the small backend needed for Discord login and flight-plan storage. GitHub Pages is only the frontend, so that same bot process must be reachable at a public HTTPS URL for the published site to use it. Set `window.AA_API_BASE` before `app.js` in `website/index.html` to that URL, for example:

When running locally, open `http://localhost:3001/`. The bot serves the dashboard and its backend from the same process.

```html
<script>window.AA_API_BASE = 'https://api.example.com';</script>
<script src="app.js"></script>
```

The API host must set `WEBSITE_API_ORIGIN=https://iancodes0.github.io`, and the Discord application OAuth redirect URI must exactly match `DISCORD_REDIRECT_URI=https://iancodes0.github.io/aa-flight-ops/`. GitHub Pages cannot call `127.0.0.1`, so the local default is intended only for testing on the same machine as the bot.

The UI is American Airlines-inspired but uses its own abstract wing graphic and is not affiliated with or endorsed by American Airlines.
