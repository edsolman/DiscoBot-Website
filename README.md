# DiscoBot Website

Web dashboard project for DiscoBot, located separately from the Python bot.

## Features

- Discord OAuth2 login (`identify`, `guilds`)
- Public pages: home, terms, privacy
- Installable PWA support (iPhone/iPad/Android) from a home-page "Download App" button
- Dashboard showing guilds where:
  - the signed-in user is a member
  - DiscoBot is installed
- Guild configuration page for editing `gamification_levels`
- Level preset export/import (JSON) for reusing gamification setups across guilds
- Authorization for config edits:
  - Discord admin in the guild, or
  - stored `installer_user_id` match in MongoDB

## Project Structure

- `server.js` - Express app, OAuth flow, session management, MongoDB operations
- `views/` - EJS templates
- `DiscoBot-App/` - PWA files (`app-install.js`, `sw.js`, `manifest.webmanifest`)
- `public/styles.css` - site styling
- `public/assets/DiscoBot.png` - logo asset
- `.env.example` - required environment variables

## Setup

1. Copy `.env.example` to `.env` and fill all values.
2. Install dependencies:
   - `npm install`
3. Start the website:
   - `npm start`

## Required Environment Variables

- `PORT`
- `SESSION_SECRET`
- `MONGODB_URI`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DISCORD_BOT_TOKEN`
- `DISCORD_BOT_USER_ID`

## Notes

- PWA install assets are served from `DiscoBot-App/` by `express.static` in `server.js`.
- Ensure deployments include the full `DiscoBot-Website` folder (including `DiscoBot-App/`) so `/manifest.webmanifest`, `/sw.js`, and `/app-install.js` are available.
- The app reads/writes guild configuration from `discordguilds.guilds`.
- Gamification levels are stored as:
  - `[{ level, name, interactions_required }, ...]`
- Existing rows using `level_name` are also accepted when reading.
- Import accepts either a raw level array or an object with `gamification_levels`.

## Post-deploy Verification

After deployment, verify these URLs return `200 OK` in your browser:

- `/manifest.webmanifest`
- `/sw.js`
- `/app-install.js`

Then open the home page and confirm:

- The **Download App** button appears on supported devices/browsers.
- Android/Chromium prompts for install when tapped.
- iPhone/iPad shows the Add to Home Screen guidance when tapped.
