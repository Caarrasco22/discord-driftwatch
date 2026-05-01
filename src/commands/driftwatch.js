const { EmbedBuilder } = require('discord.js');
const {
  getDb,
  getGuildConfig,
  upsertGuildConfig,
  deleteGuildData,
  createBaseline: createBaselineRecord,
  listBaselines: listBaselineRecords,
  getLatestBaseline,
  createAuditRun,
  finishAuditRun,
  getLatestAuditRun,
  insertFindings,
  insertSkippedChecks,
  listFindingsByRun,
  listSkippedChecksByRun,
  createReportMessage
} = require('../db/database');
const { isAuthorized } = require('../utils/auth');
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
  const run = createAuditRun(interaction.guildId, {
    baselineId: latest.baselineId,
    runType: 'baseline-compare',
    status: 'running',
    createdById: interaction.user.id,
    createdByName: interaction.user.tag || interaction.user.username
  });

  insertFindings(interaction.guildId, run.runId, comparison.findings, latest.baselineId);
  insertSkippedChecks(interaction.guildId, run.runId, comparison.skippedChecks);
  const finishedRun = finishAuditRun(interaction.guildId, run.runId, {
    status: 'completed',
    riskScore,
    summary: {
      heuristic: true,
      findingCount: comparison.findings.length,
      skippedCheckCount: comparison.skippedChecks.length
    }
  });

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
    .setTimestamp(new Date(finishedRun.finishedAt));

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
  const currentRisk = evaluateCurrentRisk(interaction.guild);
  const findings = currentRisk.findings;
  const riskScore = calculateRiskScore(findings);
  const run = createAuditRun(interaction.guildId, {
    runType: 'current-risk',
    status: 'running',
    createdById: interaction.user.id,
    createdByName: interaction.user.tag || interaction.user.username
  });

  insertFindings(interaction.guildId, run.runId, findings);
  insertSkippedChecks(interaction.guildId, run.runId, currentRisk.skippedChecks);
  const finishedRun = finishAuditRun(interaction.guildId, run.runId, {
    status: 'completed',
    riskScore,
    summary: {
      heuristic: true,
      findingCount: findings.length,
      skippedCheckCount: currentRisk.skippedChecks.length
    }
  });

  const embed = buildReportEmbed({
    title: 'Driftwatch Current Risk',
    riskScore,
    findings,
    skippedChecks: currentRisk.skippedChecks,
    run: finishedRun,
    summary: currentRisk.summary
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
  const guildConfig = getGuildConfig(interaction.guildId);
  const latestRun = getLatestAuditRun(interaction.guildId);

  if (!latestRun) {
    await interaction.reply({
      content: 'No report is available yet. Run `/driftwatch check` or `/driftwatch baseline action:compare` first.',
      ephemeral: true
    });
    return;
  }

  const findings = listFindingsByRun(interaction.guildId, latestRun.runId);
  const skippedChecks = listSkippedChecksByRun(interaction.guildId, latestRun.runId);

  const embed = buildReportEmbed({
    title: 'Driftwatch Report',
    riskScore: latestRun.riskScore ?? calculateRiskScore(findings),
    findings,
    skippedChecks,
    run: latestRun,
    summary: `Latest ${latestRun.runType} run for this guild. Status: ${latestRun.status}.`
  });

  const configuredChannel = guildConfig.report_channel_id && interaction.guild.channels.cache.get(guildConfig.report_channel_id);
  if (configuredChannel && configuredChannel.isTextBased()) {
    const message = await configuredChannel.send({ embeds: [embed] });
    createReportMessage(interaction.guildId, latestRun.runId, configuredChannel.id, message.id);

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

module.exports = { execute };
