# DiscoBot Website

Web dashboard project for DiscoBot, located separately from the Python bot.

## Features

- Discord OAuth2 login (`identify`, `guilds`)
- Public pages: home, help, terms, privacy
- Installable PWA support (iPhone/iPad/Android) from a home-page "Download App" button
- Dashboard showing guilds where:
  - the signed-in user is a member
  - DiscoBot is installed
- Guild configuration pages for:
  - feature toggles
  - gamification level setup
  - moderation words
  - translation subscription management
  - scheduled messages
- Guild leaderboard and moderation summary pages
- AI Credits wallet page (`/credits`) with one-time packs and subscriptions
- Dedicated AI image generation page (`/ai-image-generation`) using website credits
- Owner-only admin pages for settings, purchases, translation purchases, discount codes, and website error logs
- Built-in localization (11 languages) with owner pages forced to English
- Authorization for config edits:
  - Discord admin in the guild, or
  - stored `installer_user_id` match in MongoDB

## Project Structure

- `server.js` - Express app, OAuth flow, session management, MongoDB operations
- `views/` - EJS templates
- `DiscoBot-App/` - PWA files (`app-install.js`, `sw.js`, `manifest.webmanifest`)
- `public/styles.css` - site styling
- `public/assets/DiscoBot.png` - logo asset
- `.env.example` - environment variable template

## Scripts

- `npm start` - start production server
- `npm run dev` - start with Node watch mode
- `npm run stop:website` - kill local process on port `3000`

## Setup

1. Copy `.env.example` to `.env` and fill all values.
2. Install dependencies:
   - `npm install`
3. Start the website:
   - `npm start`

## Local Wi-Fi Testing (Phone)

Use these environment settings in `.env` when testing from a phone on the same network:

- `HOST=0.0.0.0`
- `PUBLIC_BASE_URL=http://<your-lan-ip>:3000` (example: `http://192.168.1.42:3000`)
- `DISCORD_REDIRECT_URI=http://<your-lan-ip>:3000/auth/discord/callback`
- `SESSION_COOKIE_SECURE=false`
- `TRUST_PROXY=false`

Also add the LAN callback URL to your Discord OAuth redirect URIs.

## Public Deployment

Use these environment settings in production:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PUBLIC_BASE_URL=https://your-domain.com`
- `DISCORD_REDIRECT_URI=https://your-domain.com/auth/discord/callback`
- `TRUST_PROXY=true` (recommended when behind nginx, cloud load balancer, or reverse proxy)
- `SESSION_COOKIE_SECURE=true`

Notes:

- `PUBLIC_BASE_URL` is used for generated links and Stripe success/cancel/portal URLs.
- Keep `DISCORD_REDIRECT_URI` and your Discord app OAuth redirect list in sync.
- If you terminate TLS at a proxy, enable `TRUST_PROXY=true` so secure cookies work correctly.

## Required Environment Variables

- `SESSION_SECRET`
- `MONGODB_URI`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DISCORD_BOT_TOKEN`
- `DISCORD_BOT_USER_ID`

`HOST` defaults to `0.0.0.0` and `PORT` defaults to `3000`.

`PORT` is optional and defaults to `3000`.

## Optional Feature Environment Variables

- `PUBLIC_BASE_URL` (used for Stripe return URLs and owner website settings defaults)
- `STRIPE_SECRET_KEY` (required for checkout/subscription flows)
- `STRIPE_WEBHOOK_SECRET` (required for Stripe webhook verification)
- `OPENAI_API_KEY` (required for website AI image generation/edit)
- `OPENAI_IMAGE_MODEL` (optional, defaults to `gpt-image-1.5`)
- `SUPPORT_EMAIL` (enables the "Report to Bot Owner" mailto button on error pages)
- `DISCORD_BOT_OWNER_ID` (used for owner-only routes; defaults in code if omitted)
- `TRUST_PROXY` (`true`/`false`, enables Express trust proxy for secure cookie handling behind reverse proxies)
- `SESSION_COOKIE_SECURE` (`true`/`false`, defaults to `true` in production and `false` in development)

## Key routes

- Auth/session:
  - `GET /auth/discord`
  - `GET /auth/discord/callback`
  - `POST /logout`
- User pages:
  - `GET /dashboard`
  - `GET /credits`
  - `GET /ai-image-generation`
  - `POST /ai-image-generation/generate-image`
- Guild pages:
  - `GET /dashboard/:guildId`
  - `GET /dashboard/:guildId/leaderboard`
  - `GET /dashboard/:guildId/moderation-summary`
- Owner pages:
  - `GET /owner/settings`
  - `GET /owner/purchases`
  - `GET /owner/translation-purchases`
  - `GET /owner/discounts`
  - `GET /owner/website-errors`
- Integrations:
  - `POST /stripe/webhook`

## Notes

- PWA install assets are served from `DiscoBot-App/` by `express.static` in `server.js`.
- Ensure deployments include the full `DiscoBot-Website` folder (including `DiscoBot-App/`) so `/manifest.webmanifest`, `/sw.js`, and `/app-install.js` are available.
- The app reads/writes guild configuration from `discordguilds.guilds`.
- Gamification levels are stored as:
  - `[{ level, name, interactions_required }, ...]`
- Existing rows using `level_name` are also accepted when reading.
- Import accepts either a raw level array or an object with `gamification_levels`.
- If Stripe is not configured, credits/subscription purchase actions are disabled but pages still load.
- If OpenAI is not configured, website AI image generation is unavailable and users are shown a clear status.

## Post-deploy Verification

After deployment, verify these URLs return `200 OK` in your browser:

- `/manifest.webmanifest`
- `/sw.js`
- `/app-install.js`

Then open the home page and confirm:

- The **Download App** button appears on supported devices/browsers.
- Android/Chromium prompts for install when tapped.
- iPhone/iPad shows the Add to Home Screen guidance when tapped.
