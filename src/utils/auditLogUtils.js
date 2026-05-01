async function safeFetchAuditLogs(guild, options = {}) {
  try {
    return { logs: await guild.fetchAuditLogs(options), skipped: null };
  } catch (error) {
    return {
      logs: null,
      skipped: {
        checkName: 'audit_logs',
        reason: error.message || 'Unable to fetch audit logs',
        missingPermission: 'ViewAuditLog'
      }
    };
  }
}

module.exports = { safeFetchAuditLogs };
