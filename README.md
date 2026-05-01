# Discord Driftwatch

Driftwatch helps you detect when your Discord server is no longer as secure as you think it is.

Driftwatch te ayuda a detectar cuándo tu servidor de Discord ya no es tan seguro como crees.

## Short Description

Discord Driftwatch is a source-available Discord security auditing bot for authorized defensive administration. It focuses on configuration drift, risky permissions, permission exposure, role and channel exposure, bot access, webhooks, invites, audit log intelligence, risk signals, and actionable reports.

In short, Driftwatch is designed as a defensive security auditing tool for Discord. Its goal is to help owners and administrators detect security drift, dangerous permissions, critical changes, unnecessary exposure, and early risk signals inside their servers. v0.1 starts with a safe and focused foundation, but the long-term vision is to evolve into a stronger security analysis tool for Discord communities.

### Resumen en español

En pocas palabras: Driftwatch está diseñado como una herramienta de auditoría defensiva para Discord. Su objetivo es ayudar a owners y administradores a detectar desviaciones de seguridad, permisos peligrosos, cambios críticos, exposición innecesaria y señales tempranas de riesgo dentro del servidor. La v0.1 empieza con una base sencilla y segura, pero la visión del proyecto es crecer hacia una solución más completa de análisis de seguridad para comunidades Discord.

## Status

Driftwatch is in early v0.1 scaffolding:

- A runnable bot skeleton exists.
- The `/driftwatch` command structure exists.
- SQLite initialization exists.
- A basic sanitized baseline snapshot exists.
- Basic baseline comparison exists.
- Current risk checks are partially implemented.
- Broader drift, logs, impact, and reports are still placeholder or early modules.
- Full audit logic is not complete yet.

### Nota en español

Ahora mismo esto es una base técnica limpia para seguir construyendo, no un producto terminado.

## Why Driftwatch Exists

Discord security often drifts slowly. A server may look stable from the outside while important security assumptions quietly change. Driftwatch exists to give administrators a clearer view of their server's security posture and to turn configuration changes into reviewable, actionable security context:

- A role gains one dangerous permission.
- A bot gets too much access.
- A staff channel becomes visible.
- A webhook appears in a sensitive channel.
- An invite has no limits.
- Many admin actions happen in a short time.

### Explicación en español

El valor de Driftwatch no está en hacer moderación automática, sino en aportar visibilidad de seguridad: detectar cambios críticos, exposición de permisos y señales de riesgo que un admin puede no ver a tiempo.

## What Driftwatch Is Not

- Not a traditional anti-raid bot.
- Not a general moderation bot.
- Not an offensive security tool.
- Not a spam, phishing, or token theft tool.
- Not a selfbot.
- Not a replacement for AutoMod, Wick, Dyno, Carl-bot, or similar moderation bots.
- Does not use user tokens.
- Does not try to bypass Discord rate limits.
- Does not automatically modify the server in v0.1.

### Nota en español

La idea es auditoría defensiva autorizada, no abuso ni automatización agresiva.

## Current Scaffold Capabilities

- Registers `/driftwatch`.
- Initializes local SQLite storage.
- Provides setup, baseline, check, logs, impact, report, data, delete-data, and help command flow.
- Can create a basic sanitized baseline from cached guild configuration.
- Can compare the latest baseline against the current cached guild configuration with v0.1 heuristic findings.
- Can run partially implemented v0.1 current risk checks for dangerous role permissions, @everyone exposure, managed roles, and sensitive-looking channel overwrites.
- Can build Discord embed reports from the latest audit run findings.
- Has placeholder modules for broader drift detection, log intelligence, and impact analysis.
- Has a simple heuristic risk score engine.
- Has documentation, privacy, security, and restricted-use licensing files.

## Planned v0.1 Scope

- Baseline create, list, and compare.
- Continue improving current risk detection.
- Drift detection.
- Audit log analysis.
- Impact analysis for roles and bots.
- Risk score.
- Discord embed reports.
- Data deletion.
- Minimal permissions.
- Bilingual text structure.

### Resumen en español

Para la v0.1 el objetivo es construir una base segura, clara y verificable: una primera versión realista que pueda crecer hacia una plataforma más completa de análisis de seguridad para comunidades Discord.

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

Sensitive commands require the guild owner, Administrator permission, Manage Server permission, or a configured authorized role. `/driftwatch delete-data` requires explicit confirmation before local guild data is deleted.

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

On Windows, use Git Bash or WSL for shell scripts, or run the npm commands manually. `.env` must be filled before deploying commands or starting the bot.

Before using Driftwatch on any important server, test the v0.1 flow in a private Discord server. See [docs/testing.md](docs/testing.md).

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

- Continue improving baseline create, list, and compare.
- Continue improving current risk checks.
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

Driftwatch is source-available and restricted-use. It is not open source. It is for authorized defensive use only.

The license does not permit raids, spam, phishing, token theft, selfbots, rate-limit evasion, unauthorized actions, resale, or SaaS use without permission.

See [LICENSE.md](LICENSE.md) for the full license terms.

## Disclaimer

Users are responsible for complying with the Discord Developer Terms, Discord Developer Policy, applicable laws, hosting rules, and the rules of any server where Driftwatch is installed. Only use Driftwatch for authorized defensive auditing.
