# AA Flight Ops Discord bot

Discord bot for community flight logs, private FAQ channels, and basic anti-spam/profanity moderation. The separate `website/` folder is a static GitHub Pages dashboard preview; its figures are sample data, not connected to Discord.

## Requirements

- Node.js 18.17 or newer
- A Discord application and bot token
- A server where you can invite/manage bots
- PM2 (included as a project dependency)

## Configure the bot

1. Run `npm install` in this project.
2. Copy `.env.example` to `.env` and put your bot token after `DISCORD_TOKEN=`. **The bot token is the only value needed in `.env`. Never commit or share `.env`.**
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

## Website repository and GitHub Pages

`website/` is the standalone static dashboard. To create the separate website repository, create a new empty repository on GitHub, initialize/push the contents of `website/` as that repository's root, then set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Its workflow will publish on pushes to `main`. The dashboard currently contains illustrative data only; a live Discord-connected dashboard needs a secure server/API and authentication, which static Pages alone cannot provide.

The UI is American Airlines-inspired but uses its own abstract wing graphic and is not affiliated with or endorsed by American Airlines.
