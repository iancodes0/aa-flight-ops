# AA Flight Ops dashboard

Pilot dashboard frontend for GitHub Pages. It uses Discord OAuth and a separate public Node API for authenticated flight-plan requests, moderation status, and pilot statistics.

## Publish with GitHub Pages

1. Create a new GitHub repository for this website and push the contents of this `website/` folder to its root (or configure the repository's Pages source to the `/website` folder on your chosen branch).
2. In the repository, open **Settings → Pages** and select **Deploy from a branch**, then choose `main` and `/ (root)` if the website files are at the repository root.
3. Save and wait for the published URL shown in Pages settings.

The included Actions workflow deploys the website directory automatically when its files change, after **Settings → Pages → Build and deployment → Source** is set to **GitHub Actions**.

## Branding

The interface uses a red, blue, silver, and white aviation palette and a custom abstract wing mark. It is an independent community project and is not affiliated with or endorsed by American Airlines. Any official logo use should follow the airline's trademark and brand guidelines.

## Bot connection

The existing bot process includes the backend for this dashboard; no separate API project is needed. When the frontend is published on GitHub Pages, set `window.AA_API_BASE` in `index.html` before `app.js` to the public HTTPS URL where that bot process is hosted. It must allow the GitHub Pages origin and use the exact Discord OAuth redirect URL configured in the Discord Developer Portal.
