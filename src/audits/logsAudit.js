const { analyzeAuditLogs } = require('../engines/logIntelligenceEngine');

async function runLogsAudit(options) {
  return analyzeAuditLogs({
    guild: options.guild,
    days: options.days,
    limit: options.limit,
    language: options.language || 'en',
    actor: options.actor || null
  });
}

module.exports = { runLogsAudit };
