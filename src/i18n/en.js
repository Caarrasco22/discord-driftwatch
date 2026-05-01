module.exports = {
  permissionDenied: 'Permission denied. Driftwatch requires the server owner, Administrator, Manage Server, or an authorized Driftwatch role.',
  notInGuild: 'Driftwatch commands must be used in a Discord server.',
  placeholder: 'This feature is scaffolded for v0.1.',
  reportLabels: {
    riskScore: 'Risk score',
    runType: 'Run type',
    timestamp: 'Timestamp',
    severitySummary: 'Severity summary',
    topFindings: 'Top findings',
    topRecommendations: 'Top recommendations',
    skippedChecks: 'Skipped checks',
    v01Note: 'v0.1 note'
  },
  reportNotes: {
    currentRisk: 'Current-risk reports detect risky current configuration using v0.1 heuristics.',
    baselineCompare: 'Baseline-comparison reports detect changes against a stored baseline using v0.1 heuristics.',
    heuristic: 'This report uses heuristic checks and cached Discord configuration data. It is a triage aid, not a guarantee of complete security coverage.',
    noFindings: 'No findings were recorded for this run.',
    noRecommendations: 'No recommendations were recorded for this run.',
    noSkippedChecks: 'None recorded.'
  }
};
