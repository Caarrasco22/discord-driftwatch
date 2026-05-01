# Risk Score

Driftwatch uses a simple heuristic risk score from 0 to 100. Higher scores mean the current findings appear riskier.

Current v0.1 scoring:

- critical: +20
- high: +10
- medium: +5
- low: +2
- info: +0

The score is capped at 100.

This score is not a scientific guarantee. It is a triage aid for authorized administrators and should be interpreted alongside the actual findings and server context.

The score is currently used by baseline comparison and current-risk checks. Both are heuristic v0.1 features and may be limited by cached Discord data and available permissions.
