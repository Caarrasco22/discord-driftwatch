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

function createAuditRun(guildId, input = {}) {
  const database = getDb();
  const runId = input.runId || createId('run');
  const startedAt = input.startedAt || nowIso();

  database.prepare(`
    INSERT INTO audit_runs (
      run_id, guild_id, baseline_id, run_type, status, risk_score, summary_json,
      started_at, finished_at, created_by_id, created_by_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    guildId,
    input.baselineId || null,
    input.runType,
    input.status || 'running',
    input.riskScore ?? null,
    input.summary ? JSON.stringify(input.summary) : null,
    startedAt,
    input.finishedAt || null,
    input.createdById || null,
    input.createdByName ? safeName(input.createdByName) : null
  );

  return {
    runId,
    guildId,
    baselineId: input.baselineId || null,
    runType: input.runType,
    status: input.status || 'running',
    riskScore: input.riskScore ?? null,
    startedAt,
    finishedAt: input.finishedAt || null
  };
}

function finishAuditRun(guildId, runId, updates = {}) {
  const database = getDb();
  const finishedAt = updates.finishedAt || nowIso();

  database.prepare(`
    UPDATE audit_runs
    SET status = ?, risk_score = ?, summary_json = ?, finished_at = ?
    WHERE guild_id = ? AND run_id = ?
  `).run(
    updates.status || 'completed',
    updates.riskScore ?? null,
    updates.summary ? JSON.stringify(updates.summary) : null,
    finishedAt,
    guildId,
    runId
  );

  return getAuditRun(guildId, runId);
}

function getAuditRun(guildId, runId) {
  const row = getDb().prepare(`
    SELECT run_id, guild_id, baseline_id, run_type, status, risk_score, summary_json,
      started_at, finished_at, created_by_id, created_by_name
    FROM audit_runs
    WHERE guild_id = ? AND run_id = ?
  `).get(guildId, runId);

  return row ? rowToAuditRun(row) : null;
}

function getLatestAuditRun(guildId) {
  const row = getDb().prepare(`
    SELECT run_id, guild_id, baseline_id, run_type, status, risk_score, summary_json,
      started_at, finished_at, created_by_id, created_by_name
    FROM audit_runs
    WHERE guild_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(guildId);

  return row ? rowToAuditRun(row) : null;
}

function insertFinding(guildId, runId, finding, baselineId = null) {
  getDb().prepare(`
    INSERT INTO findings (
      finding_id, guild_id, run_id, baseline_id, rule_id, severity, category,
      title, asset_type, asset_id, asset_name, previous_value, current_value,
      actor_id, actor_name, impact, likelihood, evidence_json, recommendation,
      confidence, remediation_difficulty, safe_to_auto_fix, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    finding.id,
    guildId,
    runId,
    baselineId,
    finding.ruleId,
    finding.severity,
    finding.category,
    finding.title,
    finding.assetType,
    finding.assetId,
    finding.assetName,
    finding.previousValue,
    finding.currentValue,
    finding.actorId,
    finding.actorName,
    finding.impact,
    finding.likelihood,
    JSON.stringify(finding.evidence || []),
    finding.recommendation,
    finding.confidence,
    finding.remediationDifficulty,
    0,
    finding.createdAt || nowIso()
  );
}

function insertFindings(guildId, runId, findings = [], baselineId = null) {
  const database = getDb();
  const transaction = database.transaction(() => {
    for (const finding of findings) {
      insertFinding(guildId, runId, finding, baselineId);
    }
  });
  transaction();
}

function listFindingsByRun(guildId, runId) {
  return getDb().prepare(`
    SELECT *
    FROM findings
    WHERE guild_id = ? AND run_id = ?
    ORDER BY created_at ASC
  `).all(guildId, runId).map(rowToFinding);
}

function insertSkippedCheck(guildId, runId, skippedCheck = {}) {
  getDb().prepare(`
    INSERT INTO skipped_checks (guild_id, run_id, check_name, reason, missing_permission, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    runId,
    skippedCheck.checkName || 'unknown',
    skippedCheck.reason || 'Check skipped because required data was not safely available.',
    skippedCheck.missingPermission || null,
    skippedCheck.createdAt || nowIso()
  );
}

function insertSkippedChecks(guildId, runId, skippedChecks = []) {
  const database = getDb();
  const transaction = database.transaction(() => {
    for (const skippedCheck of skippedChecks) {
      insertSkippedCheck(guildId, runId, skippedCheck);
    }
  });
  transaction();
}

function listSkippedChecksByRun(guildId, runId) {
  return getDb().prepare(`
    SELECT check_name, reason, missing_permission, created_at
    FROM skipped_checks
    WHERE guild_id = ? AND run_id = ?
    ORDER BY created_at ASC
  `).all(guildId, runId).map((row) => ({
    checkName: row.check_name,
    reason: row.reason,
    missingPermission: row.missing_permission,
    createdAt: row.created_at
  }));
}

function createReportMessage(guildId, runId, channelId, messageId) {
  getDb().prepare(`
    INSERT INTO report_messages (guild_id, run_id, channel_id, message_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, runId, channelId, messageId, nowIso());
}

function rowToAuditRun(row) {
  return {
    runId: row.run_id,
    guildId: row.guild_id,
    baselineId: row.baseline_id,
    runType: row.run_type,
    status: row.status,
    riskScore: row.risk_score,
    summary: parseJson(row.summary_json, null),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdById: row.created_by_id,
    createdByName: row.created_by_name
  };
}

function rowToFinding(row) {
  return {
    id: row.finding_id,
    ruleId: row.rule_id,
    severity: row.severity,
    category: row.category,
    title: row.title,
    assetType: row.asset_type,
    assetId: row.asset_id,
    assetName: row.asset_name,
    previousValue: row.previous_value,
    currentValue: row.current_value,
    actorId: row.actor_id,
    actorName: row.actor_name,
    impact: row.impact,
    likelihood: row.likelihood,
    evidence: parseJson(row.evidence_json, []),
    recommendation: row.recommendation,
    confidence: row.confidence,
    remediationDifficulty: row.remediation_difficulty,
    safeToAutoFix: false,
    createdAt: row.created_at
  };
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  initDatabase,
  getDb,
  getGuildConfig,
  upsertGuildConfig,
  deleteGuildData,
  createBaseline,
  listBaselines,
  getLatestBaseline,
  createAuditRun,
  finishAuditRun,
  getLatestAuditRun,
  insertFinding,
  insertFindings,
  listFindingsByRun,
  insertSkippedCheck,
  insertSkippedChecks,
  listSkippedChecksByRun,
  createReportMessage
};
