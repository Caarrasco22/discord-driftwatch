# Risk Score

Driftwatch uses a simple heuristic risk score from 0 to 100. Higher scores mean the current findings appear riskier.

Initial scoring placeholder:

- critical: +20
- high: +10
- medium: +5
- low: +2
- info: +0

The score is capped at 100.

This score is not a scientific guarantee. It is a triage aid for authorized administrators and should be interpreted alongside the actual findings and server context.
