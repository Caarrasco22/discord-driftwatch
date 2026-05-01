const severityLabels = {
  critical: '🔴 Critical',
  high: '🟠 High',
  medium: '🟡 Medium',
  low: '🔵 Low',
  info: '⚪ Info'
};

function formatFinding(finding) {
  const label = severityLabels[finding.severity] || finding.severity.toUpperCase();
  return `**${label}** ${finding.title}`;
}

module.exports = { formatFinding, severityLabels };
