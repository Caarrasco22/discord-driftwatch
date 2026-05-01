# Discord Driftwatch

Discord Driftwatch is a source-available Discord security auditing bot for authorized defensive server administration. It helps server owners and administrators track configuration drift, risky permissions, role and channel exposure, bot visibility, webhooks, invites, audit log signals, and actionable security findings.

Driftwatch is not an offensive security tool. It must not be used for raids, spam, phishing, token theft, selfbots, unauthorized monitoring, or moderation abuse.

## Status

This repository is in early v0.1 scaffolding and is not a complete security auditing product yet. The bot can register a `/driftwatch` slash command, initialize SQLite storage, create sanitized baseline snapshots from cached guild configuration, and return safe placeholder reports. Full audit logic is intentionally not presented as complete.

## Principles

- Authorized defensive use only.
- Official Discord APIs only.
- No Message Content Intent.
- No Guild Presences Intent.
- Avoid Guild Members Intent unless a future documented feature clearly requires it.
- Minimal permissions; Administrator is not required by default.
- No automatic destructive fixes in v0.1.
- `safeToAutoFix` is always false in v0.1.

## Requirements

- Node.js 18 or newer recommended.
- A Discord application and bot token.
- A server where you have permission to add and configure the bot.

## Quick Start

```bash
./install.sh
npm run deploy-commands
npm start
```

`install.sh` creates `.env` from `.env.example` only if `.env` does not already exist. Fill `.env` before deploying commands or starting the bot:

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DATABASE_PATH=./data/driftwatch.sqlite
LOG_LEVEL=info
DEFAULT_LANGUAGE=en
```

`DISCORD_GUILD_ID` is optional. If set, slash commands are registered only to that guild for faster development. If omitted, commands are registered globally.

## Slash Command

Driftwatch registers one root command:

```text
/driftwatch
```

Initial subcommands:

- `setup`
- `baseline`
- `check`
- `logs`
- `impact`
- `report`
- `data`
- `delete-data`
- `help`

Sensitive commands require the guild owner, Administrator permission, Manage Server permission, or a role configured in Driftwatch's `authorized_roles` table.

## Permissions

Recommended minimum Discord permissions:

- View Channels
- Send Messages
- Embed Links
- View Audit Log

Administrator is not required by default. Optional permissions may improve future analysis depth, but missing optional permissions should be handled as skipped checks instead of hard failures.

See [docs/permissions.md](docs/permissions.md).

## Data

Driftwatch stores configuration baselines, findings, audit run summaries, report message references, skipped checks, and guild-level settings in local SQLite storage. It does not store message content, DMs, user tokens, passwords, or IP addresses.

See [PRIVACY.md](PRIVACY.md) and [docs/data-retention.md](docs/data-retention.md).

## Self-Hosting

See [docs/self-hosting.md](docs/self-hosting.md) for Linux server setup, update flow, and a simple systemd example.

## License

See [LICENSE.md](LICENSE.md). This project is source-available with restricted use.
