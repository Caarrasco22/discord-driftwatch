# Self-Hosting

Driftwatch can be self-hosted on a Linux server with Node.js.

## First Install

```bash
git clone https://github.com/caarrasco22/discord-driftwatch.git
cd discord-driftwatch
./install.sh
```

`install.sh` prints the detected Node.js version, runs `npm install`, creates `data/` and `logs/`, and creates `.env` from `.env.example` only when `.env` does not already exist.

Edit `.env`:

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DATABASE_PATH=./data/driftwatch.sqlite
LOG_LEVEL=info
DEFAULT_LANGUAGE=en
```

Install dependencies manually if needed:

```bash
npm install
```

Run the local setup doctor before deploying commands:

```bash
npm run doctor
```

`npm run doctor` checks the local setup only. It verifies Node.js, project files, dependencies, `.env`, required environment variables, and the SQLite database directory. It does not login to Discord, call Discord APIs, verify server permissions, or run database migrations.

For development or contributions, you can also run:

```bash
npm run validate
```

`npm run validate` checks code syntax, CommonJS module loading, required files, and basic safety guards. It does not require `.env`, does not login to Discord, and does not deploy slash commands. Normal self-hosted users usually only need `npm run doctor`; `npm run validate` is mainly for developers and contributors checking code health.

Register commands:

```bash
npm run deploy-commands
```

Start the bot:

```bash
npm start
```

By default, the SQLite database is stored at `./data/driftwatch.sqlite`. Runtime logs are written to the console and, when possible, appended to `./logs/driftwatch.log`.

## Troubleshooting First

If Driftwatch does not start or commands are not ready, run:

```bash
npm run doctor
```

Common results:

- `FAIL dependency loaded`: run `npm install`.
- `FAIL .env missing`: create it with `cp .env.example .env`.
- `FAIL DISCORD_TOKEN missing`: add the bot token to `.env`. Never commit `.env`.
- `FAIL DISCORD_CLIENT_ID missing`: add the application/client ID to `.env`.
- `WARN DISCORD_GUILD_ID missing`: global commands may take longer. Add a test server ID for faster command deployment.
- `FAIL Database directory is not writable`: create the directory or fix filesystem permissions.

Doctor does not verify Discord server permissions. Check the bot invite separately.

Minimum bot permissions:

- View Channels
- Send Messages
- Embed Links
- View Audit Log

Do not enable Message Content Intent, Guild Presences Intent, or Guild Members Intent for v0.1/basic mode.

## First Use Flow

After the bot is running and commands are deployed, use this order in Discord:

```text
/driftwatch setup
/driftwatch check
/driftwatch logs
/driftwatch baseline action:create
/driftwatch report source:latest
```

Create a baseline only after reviewing current visible risks and recent administrative activity. A baseline is a stored reference point, not proof that the server is secure.

First review. Then set a reference. Then monitor changes.

## Updating From GitHub

```bash
./update.sh
```

`update.sh` runs `git pull` and `npm install`. It runs `npm run deploy-commands` only when `.env` exists and includes `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. It never overwrites `.env`.

Restart the bot or systemd service after updating.

## Scripts

- `install.sh`: checks Node.js, installs dependencies, creates `data/` and `logs/`, and creates `.env` only if missing.
- `start.sh`: runs `npm start`.
- `update.sh`: runs `git pull`, installs dependencies, deploys commands when required environment values exist, and prints a restart reminder.

## Simple systemd Example

```ini
[Unit]
Description=Discord Driftwatch
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/discord-driftwatch
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Adjust paths for your server. Keep `.env` readable only by the service user.
