# Privacy

Driftwatch stores only the data needed to provide authorized defensive server auditing.

## Data Stored

- Guild configuration for Driftwatch, such as language, report channel, and retention settings.
- Authorized role IDs configured for Driftwatch access.
- Baselines containing sanitized snapshots of server configuration, such as role names, channel names, permission bitfields, and timestamps.
- Audit run summaries, including status, risk score, timestamps, and summary JSON.
- Findings, including severity, category, affected asset, evidence, recommendation, confidence, and timestamps.
- Report message references, such as channel ID and message ID.
- Skipped checks, including the reason and missing permission when applicable.

## Data Not Stored

Driftwatch does not store message content, direct messages, user tokens, bot tokens, passwords, emails, IP addresses, raw audit log objects, full Discord object dumps, or private credentials. Driftwatch does not request Message Content Intent, Guild Presences Intent, or Guild Members Intent in v0.1/basic mode.

Audit log analysis stores only derived findings, summaries, skipped checks, and report references in local SQLite. It does not store raw Discord audit log entries.

## Baselines And Findings

Baselines are local snapshots used to compare server configuration over time. Findings are generated records describing possible risks or changes. Audit run summaries help administrators understand when checks were run and what the result was.

Default retention is 30 days for findings and audit run summaries. Driftwatch keeps the latest 5 baselines per guild by default.

## Delete Data

Server administrators can use `/driftwatch delete-data confirm:true` to delete guild-related Driftwatch data from the local SQLite database. This removes local Driftwatch records for that guild; it does not modify Discord server configuration.
