# Permissions

Driftwatch is designed to run with minimal permissions. Administrator is not required by default.

## Minimum Permissions

- View Channels
- Send Messages
- Embed Links
- View Audit Log

## Optional Permissions

- Manage Guild: deeper invite analysis when required.
- Manage Webhooks: deeper webhook analysis when required.
- Manage Channels: only if a future configuration creates a private report channel.

Missing optional permissions should be recorded as skipped checks instead of causing the whole audit to fail.
