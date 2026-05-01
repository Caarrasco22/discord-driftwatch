const { analyzeAuditLogs } = require('../engines/logIntelligenceEngine');

async function runLogsAudit(options) {
  return analyzeAuditLogs(options);
}

module.exports = { runLogsAudit };
