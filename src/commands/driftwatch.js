const { getDb, getGuildConfig, upsertGuildConfig, deleteGuildData } = require('../db/database');
const { isAuthorized } = require('../utils/auth');
const { createId } = require('../utils/ids');
const { nowIso } = require('../utils/time');
const { safeName } = require('../utils/safeNames');
const { collectBaseline } = require('../baseline/collectBaseline');
const { serializeBaseline } = require('../baseline/serializeBaseline');
const { enforceBaselineRetention } = require('../baseline/baselineRetention');
const { evaluateCurrentRisk } = require('../engines/currentRiskEngine');
const { calculateRiskScore } = require('../engines/riskScoreEngine');
const { estimateImpact } = require('../engines/impactEngine');
const { runLogsAudit } = require('../audits/logsAudit');
const { buildReportEmbed } = require('../reports/reportEmbeds');
const en = require('../i18n/en');

const publicSubcommands = new Set(['help']);

async function execute(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: en.notInGuild, ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (!publicSubcommands.has(subcommand) && !(await isAuthorized(interaction))) {
    await interaction.reply({ content: en.permissionDenied, ephemeral: true });
    return;
  }

  if (subcommand === 'setup') return handleSetup(interaction);
  if (subcommand === 'baseline') return handleBaseline(interaction);
  if (subcommand === 'check') return handleCheck(interaction);
  if (subcommand === 'logs') return handleLogs(interaction);
  if (subcommand === 'impact') return handleImpact(interaction);
  if (subcommand === 'report') return handleReport(interaction);
  if (subcommand === 'data') return handleData(interaction);
  if (subcommand === 'delete-data') return handleDeleteData(interaction);
  return handleHelp(interaction);
}

async function handleSetup(interaction) {
  const config = upsertGuildConfig(interaction.guildId, {
    language: process.env.DEFAULT_LANGUAGE || 'en'
  });

  await interaction.reply({
    content: [
      'Driftwatch is initialized for this server.',
      `Language: ${config.language}`,
      'Next steps: create a baseline with `/driftwatch baseline action:create`, then run `/driftwatch check`.',
      'Administrator is not required by default, and v0.1 will not make destructive server changes.'
    ].join('\n'),
    ephemeral: true
  });
}

async function handleBaseline(interaction) {
  const action = interaction.options.getString('action', true);
  if (action === 'create') return createBaseline(interaction);
  if (action === 'list') return listBaselines(interaction);

  await interaction.reply({
    content: 'Baseline comparison is scaffolded for v0.1. No configuration changes were made.',
    ephemeral: true
  });
}

async function createBaseline(interaction) {
  await interaction.deferReply({ ephemeral: true });

  getGuildConfig(interaction.guildId);
  const snapshot = await collectBaseline(interaction.guild);
  const baselineId = createId('baseline');
  const createdAt = nowIso();

  getDb().prepare(`
    INSERT INTO baselines (
      baseline_id, guild_id, label, snapshot_json, schema_version,
      created_by_id, created_by_name, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    baselineId,
    interaction.guildId,
    `Baseline ${createdAt}`,
    serializeBaseline(snapshot),
    1,
    interaction.user.id,
    safeName(interaction.user.tag || interaction.user.username),
    createdAt
  );

  enforceBaselineRetention(interaction.guildId);

  await interaction.editReply({
    content: [
      'Baseline created from cached guild configuration.',
      `Baseline ID: ${baselineId}`,
      `Roles captured: ${snapshot.roles.length}`,
      `Channels captured: ${snapshot.channels.length}`,
      'No messages, DMs, tokens, passwords, or IP addresses were collected.'
    ].join('\n')
  });
}

async function listBaselines(interaction) {
  const rows = getDb().prepare(`
    SELECT baseline_id, label, created_at
    FROM baselines
    WHERE guild_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(interaction.guildId);

  if (rows.length === 0) {
    await interaction.reply({ content: 'No baselines found for this server yet.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: rows.map((row) => `- ${row.baseline_id} | ${row.label || 'unlabeled'} | ${row.created_at}`).join('\n'),
    ephemeral: true
  });
}

async function handleCheck(interaction) {
  await interaction.deferReply({ ephemeral: true });

  getGuildConfig(interaction.guildId);
  const runId = createId('run');
  const startedAt = nowIso();
  const findings = evaluateCurrentRisk(interaction.guild);
  const riskScore = calculateRiskScore(findings);
  const finishedAt = nowIso();

  const db = getDb();
  db.prepare(`
    INSERT INTO audit_runs (
      run_id, guild_id, run_type, status, risk_score, summary_json,
      started_at, finished_at, created_by_id, created_by_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    interaction.guildId,
    'current-risk',
    'completed',
    riskScore,
    JSON.stringify({ placeholder: true, findingCount: findings.length }),
    startedAt,
    finishedAt,
    interaction.user.id,
    safeName(interaction.user.tag || interaction.user.username)
  );

  for (const finding of findings) {
    insertFinding({ guildId: interaction.guildId, runId, finding });
  }

  const embed = buildReportEmbed({
    title: 'Driftwatch Current Risk',
    riskScore,
    findings,
    summary: 'Safe v0.1 placeholder run completed. No server configuration was changed.'
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handleLogs(interaction) {
  const days = interaction.options.getInteger('days') || 7;
  const limit = interaction.options.getInteger('limit') || 100;
  const result = await runLogsAudit({ days, limit });

  await interaction.reply({
    content: `${result.summary}\nNo audit log findings are generated by the v0.1 placeholder.`,
    ephemeral: true
  });
}

async function handleImpact(interaction) {
  const result = estimateImpact();
  await interaction.reply({
    content: `${result.summary}\nNo destructive actions or automatic fixes are implemented.`,
    ephemeral: true
  });
}

async function handleReport(interaction) {
  const row = getDb().prepare(`
    SELECT run_id, risk_score, status, finished_at
    FROM audit_runs
    WHERE guild_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(interaction.guildId);

  if (!row) {
    await interaction.reply({ content: 'No report is available yet. Run `/driftwatch check` first.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `Latest run: ${row.run_id}\nStatus: ${row.status}\nRisk score: ${row.risk_score ?? 'n/a'}\nFinished: ${row.finished_at || 'n/a'}`,
    ephemeral: true
  });
}

async function handleData(interaction) {
  const db = getDb();
  const counts = {
    baselines: db.prepare('SELECT COUNT(*) AS count FROM baselines WHERE guild_id = ?').get(interaction.guildId).count,
    auditRuns: db.prepare('SELECT COUNT(*) AS count FROM audit_runs WHERE guild_id = ?').get(interaction.guildId).count,
    findings: db.prepare('SELECT COUNT(*) AS count FROM findings WHERE guild_id = ?').get(interaction.guildId).count
  };

  await interaction.reply({
    content: [
      'Driftwatch stores local SQLite records for guild settings, authorized roles, baselines, audit runs, findings, report references, and skipped checks.',
      'It does not store message content, DMs, user tokens, passwords, or IP addresses.',
      `Current local counts: ${counts.baselines} baseline(s), ${counts.auditRuns} audit run(s), ${counts.findings} finding(s).`,
      'Default retention: findings 30 days, audit summaries 30 days, latest 5 baselines.'
    ].join('\n'),
    ephemeral: true
  });
}

async function handleDeleteData(interaction) {
  const confirm = interaction.options.getBoolean('confirm', true);
  if (!confirm) {
    await interaction.reply({
      content: "No data was deleted. Re-run with `confirm:true` to remove this guild's local Driftwatch data.",
      ephemeral: true
    });
    return;
  }

  deleteGuildData(interaction.guildId);
  await interaction.reply({
    content: 'Guild-related Driftwatch data was deleted from local SQLite storage. No Discord server configuration was changed.',
    ephemeral: true
  });
}

async function handleHelp(interaction) {
  await interaction.reply({
    content: [
      '`/driftwatch setup` - initialize server config',
      '`/driftwatch baseline action:create|list|compare` - manage baselines',
      '`/driftwatch check` - run safe placeholder current-risk check',
      '`/driftwatch logs days limit` - placeholder audit log analysis',
      '`/driftwatch impact` - placeholder impact analysis',
      '`/driftwatch report` - show latest run status',
      '`/driftwatch data` - explain local data and retention',
      "`/driftwatch delete-data confirm:true` - delete this guild's local Driftwatch data"
    ].join('\n'),
    ephemeral: true
  });
}

function insertFinding({ guildId, runId, finding }) {
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
    null,
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
    JSON.stringify(finding.evidence),
    finding.recommendation,
    finding.confidence,
    finding.remediationDifficulty,
    0,
    finding.createdAt
  );
}

module.exports = { execute };
