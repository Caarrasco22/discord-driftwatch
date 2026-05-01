# Driftwatch

**Driftwatch helps you detect when your Discord server is no longer as secure as you think it is.**

Driftwatch is a source-available Discord security auditing bot focused on configuration drift, risky permissions, role changes, bot exposure, webhooks, invites, audit logs and actionable security reports.

It is designed for authorized defensive auditing only.

---

## Status

Driftwatch is currently in early design / v0.1 planning.

The first version will focus on building a useful, realistic and safe foundation before adding advanced features.

Current target: **v0.1**

---

## What Driftwatch does

Driftwatch helps Discord server owners and administrators understand whether their server security still matches what they believe is configured.

It can help answer questions like:

- Did a role gain dangerous permissions?
- Did a bot receive more access than expected?
- Did a sensitive channel become visible to the wrong roles?
- Were risky administrative changes made recently?
- Are webhooks or invites increasing the server’s exposure?
- Does the current server configuration still match the known safe baseline?

---

## Product statement

> Driftwatch helps you detect when your Discord server is no longer as secure as you think it is.

Spanish:

> Driftwatch te ayuda a detectar cuándo tu servidor de Discord ya no es tan seguro como crees.

---

## What Driftwatch is not

Driftwatch is not:

- A traditional anti-raid bot.
- A general-purpose moderation bot.
- A spam tool.
- A phishing tool.
- A selfbot.
- A tool for attacking Discord servers.
- A tool for stealing tokens, credentials or personal data.
- A replacement for Discord AutoMod, Wick, Dyno, Carl-bot or other moderation bots.
- A tool for bypassing Discord rate limits or platform restrictions.

Driftwatch must only be used on Discord servers you own, operate or are explicitly authorized to audit.

---

## Core idea

Most Discord security problems do not start with a dramatic attack.

They often start with small changes:

- A role gets one extra permission.
- A bot is invited with too much access.
- A staff channel becomes visible to the wrong role.
- A webhook appears in a sensitive channel.
- An invite is created without limits.
- Several admin actions happen too quickly to notice.

Driftwatch is designed to detect those changes, explain why they matter and help admins decide what to fix first.

---

## Planned v0.1 features

### Security baseline

Driftwatch will be able to create a sanitized snapshot of important server security settings, including:

- Sensitive roles.
- Dangerous permissions.
- Role hierarchy.
- Installed bots.
- Channel permission overwrites.
- `@everyone` permissions.
- Webhooks, when permissions allow it.
- Invites, when permissions allow it.
- Relevant server configuration when available.

---

### Drift detection

Driftwatch will compare the current server state against a previous baseline and detect dangerous changes such as:

- A role gaining `Administrator`.
- A role gaining `Manage Roles`.
- A role gaining `Manage Guild`.
- A role gaining `Manage Channels`.
- A role gaining `Manage Webhooks`.
- A role gaining `Ban Members` or `Kick Members`.
- A role gaining `Mention Everyone`.
- A new bot with high-risk permissions.
- A bot moving higher in the role hierarchy.
- A sensitive channel becoming visible to non-staff roles.
- `@everyone` gaining dangerous permissions.
- A new webhook appearing in a sensitive channel.
- Unlimited or non-expiring invites, when visible to the bot.

---

### Current risk detection

Driftwatch should not only detect changes.

If the baseline already contained risky settings, Driftwatch should still report them as current risks.

Example:

```text
No critical drift detected, but the current configuration contains 3 high-risk permission issues.
```

---

### Audit log intelligence

Driftwatch will analyze recent Discord audit logs to identify:

- Critical administrative changes.
- Role changes.
- Channel changes.
- Webhook changes.
- Invite changes.
- Bots added to the server.
- Bans, kicks or timeouts in bursts.
- Suspicious change sequences.
- Multiple risky actions by the same actor in a short time window.

Default target:

```text
Last 7 days
Maximum 500 audit log entries
```

Internal maximum target:

```text
Last 45 days
Maximum 1000 audit log entries
```

---

### Impact analysis

Driftwatch will estimate how much damage a risky role or bot could cause.

Initial v0.1 impact analysis will focus on:

- Roles.
- Bots.
- Dangerous permissions.
- Role hierarchy.
- Approximate number of affected channels.
- Ability to manage roles.
- Ability to manage channels.
- Ability to manage webhooks.
- Ability to ban or kick members.
- Ability to mention everyone.

Member-specific analysis may be considered later, but it is not part of the initial v0.1 scope.

---

### Risk Score

Driftwatch will use a heuristic risk score from 0 to 100.

Higher means riskier.

Planned sub-scores:

- Permission Risk
- Bot Risk
- Channel Risk
- Webhook Risk
- Invite Risk
- Drift Risk
- Log Risk
- Impact Risk

The score is intended to help prioritize findings, not to replace human judgment.

---

### Reports

Initial reports will be sent as Discord embeds.

A report should include:

- Overall Risk Score.
- Summary of detected findings.
- Findings grouped by severity.
- Top recommended actions.
- Skipped checks due to missing optional permissions.
- Timestamp.
- Baseline used for comparison, when applicable.

Future export formats may include Markdown, JSON or PDF.

---

## Commands

All commands will be grouped under:

```text
/driftwatch
```

Planned v0.1 commands:

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

---

## Permissions

Driftwatch is designed to work with minimal permissions.

Recommended minimum permissions:

- View Channels
- Send Messages
- Embed Links
- View Audit Log

Optional permissions:

- Manage Guild, only if required for deeper invite analysis.
- Manage Webhooks, only if required for deeper webhook analysis.
- Manage Channels, only if the admin wants Driftwatch to create a private report channel automatically.

Driftwatch should not require `Administrator` by default.

---

## Gateway intents

Driftwatch is designed to avoid unnecessary privileged intents.

Required:

- Guilds

Optional, only if justified:

- GuildModeration

Not required by default:

- Message Content
- Guild Presences
- Guild Members

Driftwatch does not need message content to perform its core security checks.

---

## Data and privacy

Driftwatch is designed to store only the minimum data required for authorized security auditing.

Driftwatch may store:

- Guild ID.
- Minimal server-specific bot settings.
- Sanitized baselines.
- Audit run summaries.
- Finding summaries.
- Timestamps.
- Retention settings.

Driftwatch does not store:

- Message content.
- Direct messages.
- User tokens.
- Passwords.
- Emails.
- IP addresses.
- Unnecessary personal data.
- Full raw logs unless explicitly implemented and documented in the future.

Discord bots do not normally receive user IP addresses through the official Discord API. Driftwatch is not designed around IP collection or IP-based enforcement.

---

## Data deletion

Server administrators should be able to delete all Driftwatch data related to their server using:

```text
/driftwatch delete-data
```

This should delete:

- Server settings.
- Authorized role settings.
- Stored baselines.
- Audit run summaries.
- Findings.
- Report metadata.

---

## Default retention

Planned defaults:

- Findings: 30 days.
- Audit run summaries: 30 days.
- Baselines: latest 5 per server.

Retention settings may become configurable per server.

---

## Planned tech stack

Initial stack:

- Node.js
- discord.js v14
- CommonJS
- SQLite
- dotenv
- Slash commands

SQLite is planned for v0.1 to keep the project simple and easy to self-host.

If Driftwatch grows into a public or closed beta, PostgreSQL may be considered later.

---

## Planned repository structure

```text
src/
  index.js
  deploy-commands.js

  commands/
    driftwatch.js

  config/
    defaults.js
    permissions.js

  i18n/
    en.js
    es.js

  baseline/
    collectBaseline.js
    compareBaseline.js
    serializeBaseline.js
    baselineRetention.js

  audits/
    logsAudit.js
    rolesAudit.js
    channelsAudit.js
    botsAudit.js
    webhooksAudit.js
    invitesAudit.js

  engines/
    driftEngine.js
    currentRiskEngine.js
    impactEngine.js
    riskScoreEngine.js
    logIntelligenceEngine.js
    effectivePermissionsEngine.js

  reports/
    buildReport.js
    reportEmbeds.js
    findingFormatter.js

  models/
    finding.js
    severity.js
    categories.js

  db/
    database.js
    migrations.js
    schema.sql

  utils/
    logger.js
    safeNames.js
    chunkText.js
    auditLogUtils.js
    permissionLabels.js
    time.js
    ids.js
```

---

## License

Driftwatch is planned as source-available software under a restricted use license.

The code may be reviewed, studied and used for authorized defensive auditing.

The license should prohibit:

- Use against servers without authorization.
- Raids.
- Spam.
- Phishing.
- Token theft.
- Selfbots.
- User-token automation.
- Rate limit evasion.
- Unauthorized destructive actions.
- Unauthorized resale.
- Offering Driftwatch as SaaS or a managed commercial service without permission.

Driftwatch should not be described as open source if the final license restricts usage.

See `LICENSE.md` when available.

---

## Security

Driftwatch is intended to be a defensive tool.

If you discover a vulnerability or safety issue, please report it responsibly instead of publishing it publicly first.

See `SECURITY.md` when available.

---

## Roadmap

### v0.1

- Slash command structure.
- Basic setup command.
- SQLite database.
- Baseline creation.
- Baseline comparison.
- Current risk detection.
- Audit log analysis.
- Role and bot impact analysis.
- Heuristic risk score.
- Discord embed reports.
- Data explanation command.
- Guild data deletion command.
- Basic English and Spanish text structure.

### v0.2

- Markdown report export.
- Better sensitive channel detection.
- More configurable rules.
- Report history.
- Better i18n coverage.
- Improved documentation.

### Future

- PostgreSQL support.
- Optional dashboard.
- Closed beta hosting.
- App Directory preparation.
- Advanced reporting.
- PDF export.
- Member-specific analysis if justified and privacy-safe.

---

## Disclaimer

Driftwatch is provided for authorized defensive use only.

You are responsible for complying with Discord’s Developer Terms, Discord’s Developer Policy, applicable laws and the rules of any server where Driftwatch is installed.