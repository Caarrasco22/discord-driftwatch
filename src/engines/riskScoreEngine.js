const weights = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 0
};

function calculateRiskScore(findings = []) {
  const score = findings.reduce((total, finding) => {
    return total + (weights[finding.severity] || 0);
  }, 0);

  return Math.min(100, score);
}

module.exports = { calculateRiskScore };
