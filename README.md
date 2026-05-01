# Discord Driftwatch

Driftwatch helps you detect when your Discord server is no longer as secure as you think it is.

Driftwatch te ayuda a detectar cuándo tu servidor de Discord ya no es tan seguro como crees.

## Short Description

Discord Driftwatch is a source-available Discord security auditing bot for authorized defensive server administration. It is designed to help server owners and administrators review configuration drift, risky permissions, role exposure, bot access, webhooks, invites, audit log signals, and actionable security findings.

### Resumen en español

Driftwatch no reemplaza a los bots de moderación. Su objetivo es comprobar si la configuración real de seguridad del servidor sigue coincidiendo con lo que el propietario o los administradores creen que está configurado.

## Status

Driftwatch is in early v0.1 scaffolding:

- A runnable bot skeleton exists.
- The `/driftwatch` slash command structure exists.
- SQLite initialization exists.
- Some modules are placeholders.
- Full audit logic is not complete yet.

### Nota en español

Ahora mismo esto es una base técnica limpia para seguir construyendo, no un producto terminado.

## What Problem It Solves

Discord servers change over time. Staff roles are edited, bots are added, channels are reorganized, permissions are changed, and old invites or webhooks may remain active. Driftwatch focuses on detecting security-relevant configuration drift, such as:

- Roles gaining dangerous permissions.
- Bots getting too much access.
- Staff channels becoming visible.
- Webhooks appearing.
- Invites without limits.
- Many admin actions in a short time.

## What Driftwatch Is Not

- Not a traditional anti-raid bot.
- Not a general moderation bot.
- Not an offensive security tool.
- Not a spam, phishing, or token tool.
- Not a selfbot.
- Not a replacement for AutoMod, Wick, Dyno, Carl-bot, or similar tools.
- Does not use user tokens.
- Does not try to bypass rate limits.

## Current v0.1 Scaffold Capabilities

- Registers the `/driftwatch` slash command.
- Initializes a local SQLite database.
- Provides setup, data, delete-data, and help command flow.
- Can create basic sanitized baselines from cached guild configuration.
- Has placeholder modules for drift, current risk, logs, impact, and reports.
- Has a simple heuristic risk score engine.
- Has source structure prepared for future modules.

## Planned v0.1 Scope

- Baseline create, list, and compare.
- Current risk detection.
- Drift detection.
- Audit log analysis.
- Impact analysis for roles and bots.
- Risk score.
- Discord embed reports.
- Data deletion.
- Minimal permissions.
- Bilingual text structure.

## Commands

```text
/driftwatch setup
/driftwatch baseline
/driftwatch check
/driftwatch logs
/driftwatch impact
/driftwatch report
/driftwatch data
/driftwatch delete-data
/driftwatch help
```

Sensitive commands require the guild owner, Administrator permission, Manage Server permission, or a configured authorized role. The `delete-data` command requires explicit confirmation before local guild data is deleted.

## Permissions

Minimum permissions:

- View Channels
- Send Messages
- Embed Links
- View Audit Log

Optional permissions:

- Manage Guild for deeper invite analysis when required.
- Manage Webhooks for deeper webhook analysis when required.
- Manage Channels only if creating a private report channel.

Administrator is not required by default. Missing optional permissions should become skipped checks, not hard failures.

## Gateway Intents

Required:

- Guilds

Avoid:

- Message Content
- Guild Presences
- Guild Members, unless a future documented feature clearly requires it.

## Data And Privacy

Driftwatch stores:

- Guild ID.
- Bot settings.
- Sanitized baselines.
- Audit run summaries.
- Finding summaries.
- Timestamps.
- Retention settings.

Driftwatch does not store:

- Message content.
- DMs.
- User tokens.
- Passwords.
- Emails.
- IP addresses.
- Unnecessary personal data.

### Nota en español

Driftwatch no está diseñado para leer conversaciones ni recopilar datos personales innecesarios.

## Installation / Quick Start

```bash
./install.sh
cp .env.example .env
nano .env
npm run deploy-commands
npm start
```

Windows users may need Git Bash or WSL for the shell scripts. They can also run the npm commands manually.

## Environment Variables

```text
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DATABASE_PATH=./data/driftwatch.sqlite
LOG_LEVEL=info
DEFAULT_LANGUAGE=en
```

## Updating

```bash
./update.sh
```

The update script runs `git pull` and `npm install`. It deploys commands only when the required environment variables are configured.

## Repository Structure

```text
docs/
src/commands/
src/baseline/
src/audits/
src/engines/
src/reports/
src/db/
src/utils/
```

## Roadmap

v0.1:

- Complete baseline create, list, and compare.
- Implement current risk checks.
- Implement drift checks.
- Implement audit log analysis.
- Implement impact analysis for roles and bots.
- Improve reports.

v0.2:

- Markdown export.
- Better sensitive channel detection.
- Configurable rules.
- Report history.
- Improved i18n.

Future:

- PostgreSQL.
- Dashboard.
- Closed beta hosting.
- App Directory preparation.
- PDF export.
- Member-specific analysis only if justified and privacy-safe.

## License

Driftwatch is source-available with restricted use. It is not open source. It is for authorized defensive use only.

See [LICENSE.md](LICENSE.md) for the full license terms.

## Disclaimer

You are responsible for complying with the Discord Developer Terms, Discord Developer Policy, applicable laws, hosting rules, and the rules of any server where Driftwatch is installed. Only use Driftwatch for authorized defensive auditing.
