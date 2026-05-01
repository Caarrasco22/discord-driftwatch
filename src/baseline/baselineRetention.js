const { getDb, getGuildConfig } = require('../db/database');

function enforceBaselineRetention(guildId) {
  const db = getDb();
  const config = getGuildConfig(guildId);
  const maxBaselines = Number(config.max_baselines) || 5;
  const rows = db.prepare(`
    SELECT baseline_id FROM baselines
    WHERE guild_id = ?
    ORDER BY created_at DESC
  `).all(guildId);

  const extra = rows.slice(maxBaselines);
  for (const row of extra) {
    db.prepare('DELETE FROM baselines WHERE baseline_id = ?').run(row.baseline_id);
  }

  return {
    kept: Math.min(rows.length, maxBaselines),
    deleted: extra.length,
    maxBaselines
  };
}

module.exports = { enforceBaselineRetention };
