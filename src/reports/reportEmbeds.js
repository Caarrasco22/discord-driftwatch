const { EmbedBuilder } = require('discord.js');
const { formatFinding, severityLabels } = require('./findingFormatter');
const { getMessages } = require('../i18n');

const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];

function summarizeSeverities(findings = [], messages = getMessages('en')) {
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
  skippedChecks = [],
  language = 'en'
}) {
  const messages = getMessages(language);
  const sortedFindings = sortFindingsBySeverity(findings);
  const topFindings = sortedFindings.slice(0, 6).map(formatFinding).join('\n') || messages.reportNotes.noFindings;
  const recommendations = topRecommendations(sortedFindings, messages);
  const runType = run && run.runType ? run.runType : 'unknown';
  const runNote = runType === 'current-risk'
    ? messages.reportNotes.currentRisk
    : runType === 'baseline-compare'
      ? messages.reportNotes.baselineCompare
      : messages.reportNotes.heuristic;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription([summary || 'Authorized defensive audit report.', runNote].join('\n\n'))
    .addFields(
      { name: messages.reportLabels.riskScore, value: String(riskScore), inline: true },
      { name: messages.reportLabels.runType, value: runType, inline: true },
      { name: messages.reportLabels.timestamp, value: run && (run.finishedAt || run.startedAt) ? (run.finishedAt || run.startedAt) : 'unknown', inline: false },
      { name: messages.reportLabels.severitySummary, value: summarizeSeverities(sortedFindings, messages), inline: false },
      { name: `${messages.reportLabels.topFindings} (${Math.min(sortedFindings.length, 6)} of ${sortedFindings.length})`, value: topFindings.slice(0, 1024), inline: false },
      { name: messages.reportLabels.topRecommendations, value: recommendations.slice(0, 1024), inline: false },
      { name: messages.reportLabels.skippedChecks, value: summarizeSkippedChecks(skippedChecks, messages), inline: false },
      { name: messages.reportLabels.v01Note, value: messages.reportNotes.heuristic, inline: false }
    )
    .setFooter({ text: 'Driftwatch v0.1 report - safeToAutoFix is false' })
    .setTimestamp(run && (run.finishedAt || run.startedAt) ? new Date(run.finishedAt || run.startedAt) : new Date());

  return embed;
}

function topRecommendations(findings, messages = getMessages('en')) {
  const seen = new Set();
  const lines = [];

  for (const finding of findings) {
    if (!finding.recommendation || seen.has(finding.recommendation)) continue;
    seen.add(finding.recommendation);
    lines.push(`- ${finding.recommendation}`);
    if (lines.length >= 4) break;
  }

  return lines.join('\n') || messages.reportNotes.noRecommendations;
}

function summarizeSkippedChecks(skippedChecks = [], messages = getMessages('en')) {
  if (skippedChecks.length === 0) return messages.reportNotes.noSkippedChecks;
  return skippedChecks
    .slice(0, 4)
    .map((item) => `- ${item.checkName || item.check_name}: ${item.reason}`)
    .join('\n')
    .slice(0, 1024);
}

module.exports = { buildReportEmbed, summarizeSeverities, sortFindingsBySeverity };
