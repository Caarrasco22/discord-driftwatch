# Data Retention

Driftwatch stores data locally in SQLite.

Stored data is limited to Driftwatch settings, authorized role IDs, sanitized baselines, audit run summaries, derived findings, skipped checks, report message references, timestamps, and retention settings.

Driftwatch does not store message content, DMs, tokens, passwords, emails, IP addresses, raw audit logs, full Discord object dumps, or unnecessary personal data.

Default retention:

- Findings: 30 days.
- Audit run summaries: 30 days.
- Baselines: latest 5 per guild.

`/driftwatch delete-data confirm:true` removes guild-related Driftwatch data from local storage, including guild settings, authorized roles, baselines, audit runs, findings, report message references, and skipped checks.

Retention settings are stored per guild and can be expanded in future versions.
