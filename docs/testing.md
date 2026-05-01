# First Discord Test Checklist

## Purpose

This checklist is for testing the current Driftwatch v0.1 scaffold safely in a private Discord server before using it anywhere important.

The goal is to validate:

- Bot login.
- Slash command deployment.
- SQLite initialization.
- Baseline create/list.
- Current risk check.
- Baseline compare.
- Report generation.
- Delete-data safety with `confirm:false`.

## Current Status

Driftwatch is still early v0.1. The baseline/check/report foundation exists, but the project is not a finished security product yet.

- Audit log analysis is not implemented yet.
- Impact analysis is not implemented yet.
- Auto-fix is intentionally not implemented.
- The bot should be tested only in a private/test server for now.

## Required `.env` Values

```text
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DATABASE_PATH=./data/driftwatch.sqlite
LOG_LEVEL=info
DEFAULT_LANGUAGE=en
```

- `DISCORD_TOKEN` is the bot token.
- `DISCORD_CLIENT_ID` is the application/client ID.
- `DISCORD_GUILD_ID` should be the test server ID for faster command deployment.
- `DATABASE_PATH` controls where SQLite is stored.

## Discord Developer Portal Checklist

- Create or open the Discord application.
- Create a bot user.
- Copy bot token into `.env`.
- Copy application/client ID into `.env`.
- Invite bot to a private test server.
- Use minimum permissions.
- Do not enable Message Content intent.
- Do not enable Guild Presences intent.
- Do not enable Guild Members intent unless a future documented feature requires it.

## Minimum Permissions

- View Channels
- Send Messages
- Embed Links
- View Audit Log

## Optional Permissions

- Manage Guild for future/deeper invite analysis when required.
- Manage Webhooks for future/deeper webhook analysis when required.
- Manage Channels only for future private report channel creation.

Administrator is not required by default. Missing optional permissions should become skipped or limited checks.

## Local Test Commands

```bash
npm install
npm run deploy-commands
npm start
```

## Linux/Self-Hosted Test Commands

```bash
chmod +x install.sh update.sh start.sh
./install.sh
nano .env
npm run deploy-commands
./start.sh
```

## First Discord Command Test Order

```text
/driftwatch help
/driftwatch data
/driftwatch setup
/driftwatch baseline action:create
/driftwatch baseline action:list
/driftwatch check
/driftwatch baseline action:compare
/driftwatch report
/driftwatch delete-data confirm:false
```

## Expected Safe Behavior

- Sensitive commands should reply ephemerally where appropriate.
- `/driftwatch delete-data confirm:false` must not delete anything.
- Missing optional permissions should be shown as skipped or limited checks.
- The bot must not read message content.
- The bot must not modify server configuration.
- The bot must not auto-fix anything.
- `safeToAutoFix` must remain false.

## What Is Still Placeholder

- Audit log analysis.
- Impact analysis.
- Advanced drift engine.
- Markdown/PDF export.
- Member-specific analysis.
- Auto-fix.

## Troubleshooting

### Commands Do Not Appear

- Check `DISCORD_CLIENT_ID`.
- Check `DISCORD_GUILD_ID`.
- Run `npm run deploy-commands` again.
- Guild commands are faster than global commands.

### Invalid Token

- Check `DISCORD_TOKEN`.
- Regenerate the token if needed.
- Never commit `.env`.

### Bot Is Online But Commands Do Not Respond

- Check console errors.
- Check bot permissions.
- Check the bot is in the correct server.
- Check the interaction handler is running.

### SQLite Errors

- Check `DATABASE_PATH`.
- Check data directory permissions.
- Delete only the test database if it is safe to reset.

### Missing Permissions

- View Audit Log is needed for future audit log features.
- Optional permissions should not crash the bot.
- Skipped checks are expected if permissions are missing.

### Windows Shell Script Limitations

- `install.sh`, `update.sh`, and `start.sh` are meant for Linux, Git Bash, or WSL.
- Windows users can run npm commands manually.

## Final Manual Validation Checklist

- [ ] Bot starts without crashing.
- [ ] Slash commands appear in the test server.
- [ ] `/driftwatch help` responds.
- [ ] `/driftwatch data` explains stored data.
- [ ] `/driftwatch baseline action:create` creates a baseline.
- [ ] `/driftwatch baseline action:list` lists baselines.
- [ ] `/driftwatch check` returns a risk summary.
- [ ] `/driftwatch baseline action:compare` returns a comparison summary.
- [ ] `/driftwatch report` returns or sends the latest report.
- [ ] `/driftwatch delete-data confirm:false` does not delete data.
- [ ] No message content is read.
- [ ] No server configuration is modified.

## Next Step After This Test

If the test works, the next development step can be audit log analysis or impact analysis, but only after the baseline/check/report foundation is confirmed working.
