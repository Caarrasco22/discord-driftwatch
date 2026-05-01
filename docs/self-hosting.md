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

Register commands:

```bash
npm run deploy-commands
```

Start the bot:

```bash
npm start
```

By default, the SQLite database is stored at `./data/driftwatch.sqlite`. Runtime logs are written to the console and, when possible, appended to `./logs/driftwatch.log`.

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
