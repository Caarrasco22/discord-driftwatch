const { EmbedBuilder } = require('discord.js');
const { formatFinding, severityLabels } = require('./findingFormatter');

const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];

function summarizeSeverities(findings = []) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) {
    if (Object.prototype.hasOwnProperty.call(counts, finding.severity)) {
      counts[finding.severity] += 1;
    }
  }
  return severityOrder
    .map((severity) => `${severityLabels[severity]}: ${counts[severity]}`)
    .join(' | ');
}

function sortFindingsBySeverity(findings = []) {
  return [...findings].sort((a, b) => {
    const severityDiff = severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    if (severityDiff !== 0) return severityDiff;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

function buildReportEmbed({
  title = 'Driftwatch Report',
  riskScore = 0,
  findings = [],
  summary,
  run,
  skippedChecks = []
}) {
  const sortedFindings = sortFindingsBySeverity(findings);
  const topFindings = sortedFindings.slice(0, 6).map(formatFinding).join('\n') || 'No findings were recorded for this run.';
  const recommendations = topRecommendations(sortedFindings);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(summary || 'Authorized defensive audit report.')
    .addFields(
      { name: 'Risk score', value: String(riskScore), inline: true },
      { name: 'Run type', value: run && run.runType ? run.runType : 'unknown', inline: true },
      { name: 'Timestamp', value: run && (run.finishedAt || run.startedAt) ? (run.finishedAt || run.startedAt) : 'unknown', inline: false },
      { name: 'Severity summary', value: summarizeSeverities(sortedFindings), inline: false },
      { name: `Top findings (${Math.min(sortedFindings.length, 6)} of ${sortedFindings.length})`, value: topFindings.slice(0, 1024), inline: false },
      { name: 'Top recommendations', value: recommendations.slice(0, 1024), inline: false },
      { name: 'Skipped checks', value: summarizeSkippedChecks(skippedChecks), inline: false },
      { name: 'v0.1 note', value: 'This report uses heuristic checks and cached Discord configuration data. It is a triage aid, not a guarantee of complete security coverage.', inline: false }
    )
    .setFooter({ text: 'Driftwatch v0.1 report - safeToAutoFix is false' })
    .setTimestamp(run && (run.finishedAt || run.startedAt) ? new Date(run.finishedAt || run.startedAt) : new Date());

  return embed;
}

function topRecommendations(findings) {
  const seen = new Set();
  const lines = [];

  for (const finding of findings) {
    if (!finding.recommendation || seen.has(finding.recommendation)) continue;
    seen.add(finding.recommendation);
    lines.push(`- ${finding.recommendation}`);
    if (lines.length >= 4) break;
  }

  return lines.join('\n') || 'No recommendations were recorded for this run.';
}

function summarizeSkippedChecks(skippedChecks = []) {
  if (skippedChecks.length === 0) return 'None recorded.';
  return skippedChecks
    .slice(0, 4)
    .map((item) => `- ${item.checkName || item.check_name}: ${item.reason}`)
    .join('\n')
    .slice(0, 1024);
}

module.exports = { buildReportEmbed, summarizeSeverities, sortFindingsBySeverity };
