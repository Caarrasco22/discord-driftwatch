const { getDb, getGuildConfig } = require('../db/database');

function enforceBaselineRetention(guildId) {
  const db = getDb();
  const config = getGuildConfig(guildId);
  const rows = db.prepare(`
    SELECT baseline_id FROM baselines
    WHERE guild_id = ?
    ORDER BY created_at DESC
  `).all(guildId);

  const extra = rows.slice(config.max_baselines);
  for (const row of extra) {
    db.prepare('DELETE FROM baselines WHERE baseline_id = ?').run(row.baseline_id);
  }
}

module.exports = { enforceBaselineRetention };
