const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { nowIso } = require('../utils/time');
const { createId } = require('../utils/ids');
const { safeName } = require('../utils/safeNames');

const defaultDatabasePath = path.resolve(process.cwd(), 'data', 'driftwatch.sqlite');
let db;

function getDatabasePath() {
  return path.resolve(process.env.DATABASE_PATH || defaultDatabasePath);
}

function initDatabase() {
  if (db) return db;

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  db = new Database(databasePath);
  db.pragma('journal_mode = WAL');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  return db;
}

function getDb() {
  return db || initDatabase();
}

function getGuildConfig(guildId) {
  const database = getDb();
  const existing = database.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
  if (existing) return existing;

  const timestamp = nowIso();
  database.prepare(`
    INSERT INTO guilds (guild_id, language, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, process.env.DEFAULT_LANGUAGE || 'en', timestamp, timestamp);

  return database.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
}

function upsertGuildConfig(guildId, updates = {}) {
  const database = getDb();
  const current = getGuildConfig(guildId);
  const allowed = [
    'language',
    'report_channel_id',
    'max_baselines',
    'findings_retention_days',
    'audit_retention_days'
  ];
  const next = { ...current };

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      next[key] = updates[key];
    }
  }

  next.updated_at = nowIso();
  database.prepare(`
    UPDATE guilds
    SET language = ?, report_channel_id = ?, max_baselines = ?,
      findings_retention_days = ?, audit_retention_days = ?, updated_at = ?
    WHERE guild_id = ?
  `).run(
    next.language,
    next.report_channel_id,
    next.max_baselines,
    next.findings_retention_days,
    next.audit_retention_days,
    next.updated_at,
    guildId
  );

  return getGuildConfig(guildId);
}

function deleteGuildData(guildId) {
  const database = getDb();
  const transaction = database.transaction(() => {
    database.prepare('DELETE FROM authorized_roles WHERE guild_id = ?').run(guildId);
    database.prepare('DELETE FROM baselines WHERE guild_id = ?').run(guildId);
    database.prepare('DELETE FROM audit_runs WHERE guild_id = ?').run(guildId);
    database.prepare('DELETE FROM findings WHERE guild_id = ?').run(guildId);
    database.prepare('DELETE FROM report_messages WHERE guild_id = ?').run(guildId);
    database.prepare('DELETE FROM skipped_checks WHERE guild_id = ?').run(guildId);
    database.prepare('DELETE FROM guilds WHERE guild_id = ?').run(guildId);
  });
  transaction();
}

function createBaseline(guildId, snapshot, options = {}) {
  const database = getDb();
  const baselineId = options.baselineId || createId('baseline');
  const createdAt = options.createdAt || snapshot.createdAt || snapshot.collectedAt || nowIso();
  const label = options.label || `Baseline ${createdAt}`;

  database.prepare(`
    INSERT INTO baselines (
      baseline_id, guild_id, label, snapshot_json, schema_version,
      created_by_id, created_by_name, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    baselineId,
    guildId,
    label,
    JSON.stringify(snapshot),
    snapshot.schemaVersion || 1,
    options.createdById || null,
    options.createdByName ? safeName(options.createdByName) : null,
    createdAt
  );

  return {
    baselineId,
    label,
    createdAt,
    snapshot
  };
}

function listBaselines(guildId, limit = 10) {
  return getDb().prepare(`
    SELECT baseline_id, label, snapshot_json, schema_version, created_by_id, created_by_name, created_at
    FROM baselines
    WHERE guild_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(guildId, limit).map((row) => {
    let snapshot = {};
    try {
      snapshot = JSON.parse(row.snapshot_json);
    } catch (error) {
      snapshot = { parseError: true };
    }

    return {
      baselineId: row.baseline_id,
      label: row.label,
      schemaVersion: row.schema_version,
      createdById: row.created_by_id,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      roleCount: Array.isArray(snapshot.roles) ? snapshot.roles.length : 0,
      channelCount: Array.isArray(snapshot.channels) ? snapshot.channels.length : 0,
      skippedCheckCount: Array.isArray(snapshot.skippedChecks) ? snapshot.skippedChecks.length : 0
    };
  });
}

function getLatestBaseline(guildId) {
  const row = getDb().prepare(`
    SELECT baseline_id, label, snapshot_json, schema_version, created_by_id, created_by_name, created_at
    FROM baselines
    WHERE guild_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(guildId);

  if (!row) return null;

  let snapshot = {};
  try {
    snapshot = JSON.parse(row.snapshot_json);
  } catch (error) {
    snapshot = { parseError: true };
  }

  return {
    baselineId: row.baseline_id,
    label: row.label,
    schemaVersion: row.schema_version,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    snapshot
  };
}

module.exports = {
  initDatabase,
  getDb,
  getGuildConfig,
  upsertGuildConfig,
  deleteGuildData,
  createBaseline,
  listBaselines,
  getLatestBaseline
};
