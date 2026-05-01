# Agent Instructions

Driftwatch is a source-available Discord security auditing bot for authorized defensive server administration. It is not an offensive security, raid, spam, phishing, token theft, selfbot, or moderation-abuse tool.

## Safety Boundaries

- New features must be defensive, authorized, and documented.
- Use only official Discord APIs.
- Do not implement exploit logic, token scraping, phishing, spam, raids, or unauthorized automation.
- v0.1 must not implement automatic destructive fixes.
- `safeToAutoFix` must always be false in v0.1.
- Do not add auto-ban, auto-kick, auto-delete, auto-role-edit, or auto-channel-edit behavior.

## Coding Style

- Use Node.js with CommonJS.
- Use discord.js v14.
- Use SQLite for v0.1.
- Use dotenv for configuration.
- Use slash commands.
- Keep permissions minimal; do not require Administrator by default.
- Do not use Message Content Intent.
- Do not use Guild Presences Intent.
- Avoid Guild Members Intent unless a future documented feature clearly justifies it.
- Handle missing optional permissions gracefully and record skipped checks where appropriate.

## Documentation

Any new feature must update relevant docs, especially privacy, permissions, data retention, and compliance notes when behavior changes.
