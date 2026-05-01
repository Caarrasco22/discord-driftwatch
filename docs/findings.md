# Findings

A finding is a structured record describing a possible defensive security concern, configuration drift, skipped condition, or informational result.

## Severity Values

- critical
- high
- medium
- low
- info

## Categories

- baseline
- drift
- logs
- impact
- permissions
- bots
- channels
- webhooks
- invites
- compliance

In v0.1, `safeToAutoFix` is always false. Driftwatch must not perform destructive automatic changes.

## Finding Shape

The code uses this normalized finding shape before inserting records into SQLite:

```json
{
  "id": "finding_<uuid>",
  "ruleId": "placeholder",
  "severity": "info",
  "category": "compliance",
  "title": "Informational finding",
  "assetType": "guild",
  "assetId": null,
  "assetName": null,
  "previousValue": null,
  "currentValue": null,
  "actorId": null,
  "actorName": null,
  "impact": "No direct impact identified in this placeholder finding.",
  "likelihood": "unknown",
  "evidence": [],
  "recommendation": "Review this item with an authorized server administrator.",
  "confidence": 0.5,
  "remediationDifficulty": null,
  "safeToAutoFix": false,
  "createdAt": "ISO-8601 timestamp"
}
```

SQLite stores equivalent snake_case columns, including `safe_to_auto_fix` as `0`.
