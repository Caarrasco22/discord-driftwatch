function formatFinding(finding) {
  return `**${finding.severity.toUpperCase()}** ${finding.title}`;
}

module.exports = { formatFinding };
