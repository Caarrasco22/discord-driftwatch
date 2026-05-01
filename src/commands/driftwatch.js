const { EmbedBuilder } = require('discord.js');
const {
  getDb,
  getGuildConfig,
  upsertGuildConfig,
  deleteGuildData,
  createBaseline: createBaselineRecord,
  listBaselines: listBaselineRecords,
  getLatestBaseline
} = require('../db/database');
const { isAuthorized } = require('../utils/auth');
const { createId } = require('../utils/ids');
const { nowIso } = require('../utils/time');
const { safeName } = require('../utils/safeNames');
const { collectBaseline } = require('../baseline/collectBaseline');
const { compareBaseline: compareBaselineSnapshots } = require('../baseline/compareBaseline');
const { enforceBaselineRetention } = require('../baseline/baselineRetention');
const { evaluateCurrentRisk } = require('../engines/currentRiskEngine');
const { calculateRiskScore } = require('../engines/riskScoreEngine');
const { estimateImpact } = require('../engines/impactEngine');
const { runLogsAudit } = require('../audits/logsAudit');
const { buildReportEmbed, summarizeSeverities } = require('../reports/reportEmbeds');
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
  return compareBaseline(interaction);
}

async function createBaseline(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const config = getGuildConfig(interaction.guildId);
  const snapshot = await collectBaseline(interaction.guild);
  const created = createBaselineRecord(
    interaction.guildId,
    snapshot,
    {
      createdById: interaction.user.id,
      createdByName: interaction.user.tag || interaction.user.username,
      createdAt: snapshot.createdAt
    }
  );
  const retention = enforceBaselineRetention(interaction.guildId);
  const skippedCount = snapshot.skippedChecks.length;

  const embed = new EmbedBuilder()
    .setTitle('Baseline Created')
    .setDescription('A sanitized server configuration baseline was stored locally. No messages, DMs, user tokens, emails, passwords, IP addresses, or raw audit logs were collected.')
    .addFields(
      { name: 'Baseline ID', value: created.baselineId, inline: false },
      { name: 'Roles', value: String(snapshot.roles.length), inline: true },
      { name: 'Channels', value: String(snapshot.channels.length), inline: true },
      { name: 'Visible bot members', value: String(snapshot.botMembersVisibleFromCache.length), inline: true },
      { name: 'Skipped checks', value: String(skippedCount), inline: true },
      { name: 'Retention', value: `Keeping latest ${retention.maxBaselines} baseline(s). Removed ${retention.deleted} old baseline(s).`, inline: false }
    )
    .setFooter({ text: `Guild max baselines: ${config.max_baselines || 5}` })
    .setTimestamp(new Date(created.createdAt));

  if (skippedCount > 0) {
    embed.addFields({
      name: 'Collection limitations',
      value: snapshot.skippedChecks
        .slice(0, 3)
        .map((item) => `- ${item.reason}`)
        .join('\n')
        .slice(0, 1024),
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function listBaselines(interaction) {
  const rows = listBaselineRecords(interaction.guildId, 10);

  if (rows.length === 0) {
    await interaction.reply({ content: 'No baselines found for this server yet.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Stored Baselines')
    .setDescription('Latest baselines stored locally for this guild.')
    .setTimestamp(new Date());

  for (const row of rows.slice(0, 10)) {
    const shortId = row.baselineId.length > 18 ? `${row.baselineId.slice(0, 18)}...` : row.baselineId;
    const creator = row.createdByName || 'unknown';
    const createdAt = row.createdAt || 'unknown date';
    embed.addFields({
      name: row.label || shortId,
      value: [
        `ID: ${shortId}`,
        `Created: ${createdAt}`,
        `Creator: ${creator}`,
        `Roles: ${row.roleCount} | Channels: ${row.channelCount} | Skipped: ${row.skippedCheckCount}`
      ].join('\n').slice(0, 1024),
      inline: false
    });
  }

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function compareBaseline(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const latest = getLatestBaseline(interaction.guildId);
  if (!latest || !latest.snapshot || latest.snapshot.parseError) {
    await interaction.editReply('No usable baseline found for this server yet. Create one with `/driftwatch baseline action:create` first.');
    return;
  }

  const currentSnapshot = await collectBaseline(interaction.guild);
  const comparison = compareBaselineSnapshots(latest.snapshot, currentSnapshot);
  const riskScore = calculateRiskScore(comparison.findings);
  const runId = createId('run');
  const startedAt = nowIso();
  const finishedAt = nowIso();

  getDb().prepare(`
    INSERT INTO audit_runs (
      run_id, guild_id, baseline_id, run_type, status, risk_score, summary_json,
      started_at, finished_at, created_by_id, created_by_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    interaction.guildId,
    latest.baselineId,
    'baseline-compare',
    'completed',
    riskScore,
    JSON.stringify({
      heuristic: true,
      findingCount: comparison.findings.length,
      skippedCheckCount: comparison.skippedChecks.length
    }),
    startedAt,
    finishedAt,
    interaction.user.id,
    safeName(interaction.user.tag || interaction.user.username)
  );

  for (const finding of comparison.findings) {
    insertFinding({ guildId: interaction.guildId, runId, baselineId: latest.baselineId, finding });
  }

  for (const skippedCheck of comparison.skippedChecks) {
    insertSkippedCheck({ guildId: interaction.guildId, runId, skippedCheck });
  }

  const topFindings = comparison.findings
    .slice(0, 5)
    .map((finding) => `**${finding.severity.toUpperCase()}** ${finding.title}`)
    .join('\n') || 'No baseline drift findings detected by the v0.1 heuristic comparison.';

  const embed = new EmbedBuilder()
    .setTitle('Baseline Comparison')
    .setDescription('v0.1 heuristic comparison against the latest stored baseline. No server configuration was changed.')
    .addFields(
      { name: 'Baseline used', value: `${latest.label || latest.baselineId}\n${latest.createdAt}`, inline: false },
      { name: 'Risk score', value: String(riskScore), inline: true },
      { name: 'Total findings', value: String(comparison.findings.length), inline: true },
      { name: 'Skipped checks', value: String(comparison.skippedChecks.length), inline: true },
      { name: 'Severity summary', value: summarizeSeverities(comparison.findings), inline: false },
      { name: 'Top findings', value: topFindings.slice(0, 1024), inline: false }
    )
    .setFooter({ text: 'Driftwatch v0.1 heuristic comparison - safeToAutoFix is false' })
    .setTimestamp(new Date(finishedAt));

  if (comparison.skippedChecks.length > 0) {
    embed.addFields({
      name: 'Limitations',
      value: comparison.skippedChecks
        .slice(0, 3)
        .map((item) => `- ${item.reason}`)
        .join('\n')
        .slice(0, 1024),
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleCheck(interaction) {
  await interaction.deferReply({ ephemeral: true });

  getGuildConfig(interaction.guildId);
  const runId = createId('run');
  const startedAt = nowIso();
  const currentRisk = evaluateCurrentRisk(interaction.guild);
  const findings = currentRisk.findings;
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
    JSON.stringify({
      heuristic: true,
      findingCount: findings.length,
      skippedCheckCount: currentRisk.skippedChecks.length
    }),
    startedAt,
    finishedAt,
    interaction.user.id,
    safeName(interaction.user.tag || interaction.user.username)
  );

  for (const finding of findings) {
    insertFinding({ guildId: interaction.guildId, runId, finding });
  }

  for (const skippedCheck of currentRisk.skippedChecks) {
    insertSkippedCheck({ guildId: interaction.guildId, runId, skippedCheck });
  }

  const embed = buildReportEmbed({
    title: 'Driftwatch Current Risk',
    riskScore,
    findings,
    summary: currentRisk.summary
  });

  embed.addFields({
    name: 'Skipped checks',
    value: String(currentRisk.skippedChecks.length),
    inline: true
  });

  if (currentRisk.skippedChecks.length > 0) {
    embed.addFields({
      name: 'Limitations',
      value: currentRisk.skippedChecks
        .slice(0, 3)
        .map((item) => `- ${item.reason}`)
        .join('\n')
        .slice(0, 1024),
      inline: false
    });
  }

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
  const db = getDb();
  const guildConfig = getGuildConfig(interaction.guildId);
  const row = db.prepare(`
    SELECT run_id, baseline_id, run_type, status, risk_score, summary_json, started_at, finished_at
    FROM audit_runs
    WHERE guild_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(interaction.guildId);

  if (!row) {
    await interaction.reply({
      content: 'No report is available yet. Run `/driftwatch check` or `/driftwatch baseline action:compare` first.',
      ephemeral: true
    });
    return;
  }

  const findingRows = db.prepare(`
    SELECT *
    FROM findings
    WHERE guild_id = ? AND run_id = ?
    ORDER BY created_at ASC
  `).all(interaction.guildId, row.run_id);
  const skippedRows = db.prepare(`
    SELECT check_name, reason, missing_permission, created_at
    FROM skipped_checks
    WHERE guild_id = ? AND run_id = ?
    ORDER BY created_at ASC
  `).all(interaction.guildId, row.run_id);

  const findings = findingRows.map(rowToFinding);
  const skippedChecks = skippedRows.map((skipped) => ({
    checkName: skipped.check_name,
    reason: skipped.reason,
    missingPermission: skipped.missing_permission,
    createdAt: skipped.created_at
  }));
  const run = {
    runId: row.run_id,
    baselineId: row.baseline_id,
    runType: row.run_type,
    status: row.status,
    riskScore: row.risk_score,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };

  const embed = buildReportEmbed({
    title: 'Driftwatch Report',
    riskScore: row.risk_score ?? calculateRiskScore(findings),
    findings,
    skippedChecks,
    run,
    summary: `Latest ${row.run_type} run for this guild. Status: ${row.status}.`
  });

  const configuredChannel = guildConfig.report_channel_id && interaction.guild.channels.cache.get(guildConfig.report_channel_id);
  if (configuredChannel && configuredChannel.isTextBased()) {
    const message = await configuredChannel.send({ embeds: [embed] });
    db.prepare(`
      INSERT INTO report_messages (guild_id, run_id, channel_id, message_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(interaction.guildId, row.run_id, configuredChannel.id, message.id, nowIso());

    await interaction.reply({
      content: `Report sent to ${configuredChannel}.`,
      ephemeral: true
    });
    return;
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
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
      '`/driftwatch check` - run v0.1 current-risk checks',
      '`/driftwatch logs days limit` - placeholder audit log analysis',
      '`/driftwatch impact` - placeholder impact analysis',
      '`/driftwatch report` - show latest run status',
      '`/driftwatch data` - explain local data and retention',
      "`/driftwatch delete-data confirm:true` - delete this guild's local Driftwatch data"
    ].join('\n'),
    ephemeral: true
  });
}

function insertFinding({ guildId, runId, baselineId = null, finding }) {
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
    JSON.stringify(finding.evidence),
    finding.recommendation,
    finding.confidence,
    finding.remediationDifficulty,
    0,
    finding.createdAt
  );
}

function insertSkippedCheck({ guildId, runId, skippedCheck }) {
  getDb().prepare(`
    INSERT INTO skipped_checks (guild_id, run_id, check_name, reason, missing_permission, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    runId,
    skippedCheck.checkName || 'baseline_compare',
    skippedCheck.reason || 'Check skipped because required data was not safely available.',
    skippedCheck.missingPermission || null,
    nowIso()
  );
}

function rowToFinding(row) {
  let evidence = [];
  try {
    evidence = JSON.parse(row.evidence_json || '[]');
  } catch (error) {
    evidence = [];
  }

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
    evidence,
    recommendation: row.recommendation,
    confidence: row.confidence,
    remediationDifficulty: row.remediation_difficulty,
    safeToAutoFix: Boolean(row.safe_to_auto_fix),
    createdAt: row.created_at
  };
}

module.exports = { execute };
