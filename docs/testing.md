# First Discord Test Checklist

## Purpose

This checklist is for testing the current Driftwatch v0.1 flow safely in a private Discord server before using it anywhere important.

The goal is to validate:

- Bot login.
- Slash command deployment.
- SQLite initialization.
- Setup flow.
- Current risk check.
- Audit log analysis.
- Baseline create/list.
- Baseline compare.
- Report generation.
- Delete-data safety with `confirm:false`.

## Current Status

Driftwatch is still early v0.1. It is not a finished security product and does not certify that a Discord server is secure.

Implemented foundations:

- Baseline create/list/compare.
- Current risk checks in heuristic v0.1 form.
- Safe audit log analysis in early v0.1 form.
- Stored reports.
- Data and delete-data flow.

Still limited or experimental:

- Impact analysis.
- Advanced drift logic.
- Markdown/PDF export.
- Member-specific analysis.
- Auto-fix is intentionally not implemented.

## Recommended Test Flow

Most servers are not perfectly configured when Driftwatch is installed. Do not create a baseline as proof that the server is safe. A baseline is only a reference point.

1. Run `/driftwatch setup`.
2. Run `/driftwatch check` to review current visible risks.
3. Run `/driftwatch logs` to review recent administrative activity.
4. Manually review and fix what matters.
5. When the server is in an accepted state, run `/driftwatch baseline action:create`.
6. Later, run `/driftwatch baseline action:compare` to detect drift from that accepted reference.

First review. Then set a reference. Then monitor changes.

## Flujo de prueba recomendado

La mayoria de servidores no estan perfectamente configurados cuando instalas Driftwatch. No crees un baseline como si fuera una prueba de seguridad. Un baseline solo es una referencia del estado actual.

1. Ejecuta `/driftwatch setup`.
2. Ejecuta `/driftwatch check` para revisar riesgos actuales visibles.
3. Ejecuta `/driftwatch logs` para revisar actividad administrativa reciente.
4. Revisa y corrige manualmente lo importante.
5. Cuando el servidor este en un estado aceptado, ejecuta `/driftwatch baseline action:create`.
6. Mas adelante, usa `/driftwatch baseline action:compare` para detectar desviaciones respecto a esa referencia aceptada.

Primero revisa. Luego fija una referencia. Despues vigila cambios.

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
- Do not enable Guild Members intent for v0.1/basic mode.

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
npm run validate
npm run doctor
npm run deploy-commands
npm start
```

## Linux/Self-Hosted Test Commands

```bash
chmod +x install.sh update.sh start.sh
./install.sh
nano .env
npm run validate
npm run doctor
npm run deploy-commands
./start.sh
```

## First Discord Command Test Order

```text
/driftwatch help
/driftwatch data
/driftwatch setup
/driftwatch check
/driftwatch logs
/driftwatch baseline action:create
/driftwatch baseline action:list
/driftwatch baseline action:compare
/driftwatch report source:latest
/driftwatch report source:current-risk
/driftwatch report source:baseline-compare
/driftwatch report source:logs
/driftwatch delete-data confirm:false
```

## Expected Safe Behavior

- Sensitive commands should reply ephemerally where appropriate.
- `/driftwatch delete-data confirm:false` must not delete anything.
- Missing optional permissions should be shown as skipped or limited checks.
- Missing View Audit Log should skip logs analysis instead of crashing.
- The bot must not read message content.
- The bot must not modify server configuration.
- The bot must not auto-fix anything.
- `safeToAutoFix` must remain false.

## What Is Still Placeholder Or Limited

- Impact analysis.
- Advanced drift engine.
- Markdown/PDF export.
- Member-specific analysis.
- Auto-fix.
- Audit log analysis is implemented, but still heuristic and limited by Discord audit log availability.

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

- View Audit Log is needed for `/driftwatch logs`.
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
- [ ] `/driftwatch setup` explains the review-first flow.
- [ ] `/driftwatch check` returns a risk summary.
- [ ] `/driftwatch logs` returns an audit log summary or a skipped-check explanation.
- [ ] `/driftwatch baseline action:create` creates a baseline reference after review.
- [ ] `/driftwatch baseline action:list` lists baselines.
- [ ] `/driftwatch baseline action:compare` returns a comparison summary.
- [ ] `/driftwatch report source:latest` returns or sends the latest report.
- [ ] `/driftwatch report source:current-risk` returns or sends the latest current-risk report.
- [ ] `/driftwatch report source:baseline-compare` returns or sends the latest baseline comparison report.
- [ ] `/driftwatch report source:logs` returns or sends the latest logs report.
- [ ] `/driftwatch delete-data confirm:false` does not delete data.
- [ ] No message content is read.
- [ ] No server configuration is modified.

## Next Step After This Test

If the test works, the next development step can be improving impact analysis, report clarity, or advanced audit-log correlations. Keep changes defensive, authorized, and read-only.
