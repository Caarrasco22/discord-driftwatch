const { calculateRiskScore } = require('../engines/riskScoreEngine');
const { buildReportEmbed } = require('./reportEmbeds');

function buildReport({ findings = [], summary }) {
  const riskScore = calculateRiskScore(findings);
  return {
    riskScore,
    findings,
    embeds: [buildReportEmbed({ riskScore, findings, summary })]
  };
}

module.exports = { buildReport };
