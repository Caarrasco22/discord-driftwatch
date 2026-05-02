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
  const language = config.language || process.env.DEFAULT_LANGUAGE || 'en';

  await interaction.reply({
    content: setupMessage(language, config.language),
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
  const language = config.language || process.env.DEFAULT_LANGUAGE || 'en';
  const baselineCopy = baselineCreateCopy(language);
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
    .setTitle(baselineCopy.title)
    .setDescription(baselineCopy.description)
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
  const config = getGuildConfig(interaction.guildId);
  const language = config.language || process.env.DEFAULT_LANGUAGE || 'en';
  const rows = listBaselineRecords(interaction.guildId, 10);

  if (rows.length === 0) {
    await interaction.reply({
      content: language === 'es' ? 'Todavía no hay baselines guardados para este servidor.' : 'No baselines found for this server yet.',
      ephemeral: true
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(language === 'es' ? 'Baselines guardados' : 'Stored Baselines')
    .setDescription(language === 'es'
      ? 'El baseline más reciente se usa por defecto para comparar. Recuerda que un baseline solo es una referencia, no una certificación de seguridad.'
      : 'The newest baseline is used by default for comparison. Remember: a baseline is only a reference, not a security certification.')
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

  const config = getGuildConfig(interaction.guildId);
  const language = config.language || process.env.DEFAULT_LANGUAGE || 'en';
  const latest = getLatestBaseline(interaction.guildId);
  if (!latest || !latest.snapshot || latest.snapshot.parseError) {
    await interaction.editReply(language === 'es'
      ? 'No hay un baseline utilizable para este servidor todavía. Crea uno con `/driftwatch baseline action:create` después de revisar los riesgos actuales.'
      : 'No usable baseline found for this server yet. Create one with `/driftwatch baseline action:create` after reviewing current risks first.');
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
    .setTitle(language === 'es' ? 'Comparación de baseline' : 'Baseline Comparison')
    .setDescription(language === 'es'
      ? 'Comparo contra el último baseline guardado. Si ese baseline se creó antes de revisar el servidor, puede contener problemas antiguos. No se cambió ninguna configuración del servidor.'
      : 'Comparing against the latest stored baseline reference. If that baseline was created before reviewing the server, it may contain old issues. No server configuration was changed.')
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
  await interaction.deferReply({ ephemeral: true });

  const config = getGuildConfig(interaction.guildId);
  const language = config.language || process.env.DEFAULT_LANGUAGE || 'en';
  const days = clampNumber(interaction.options.getInteger('days'), 7, 1, 45);
  const limit = clampNumber(interaction.options.getInteger('limit'), 500, 50, 1000);
  const run = createAuditRun(interaction.guildId, {
    runType: 'logs',
    status: 'running',
    createdById: interaction.user.id,
    createdByName: interaction.user.tag || interaction.user.username
  });

  try {
    const result = await runLogsAudit({
      guild: interaction.guild,
      days,
      limit,
      language,
      actor: {
        id: interaction.user.id,
        name: interaction.user.tag || interaction.user.username
      }
    });

    const findings = result.findings || [];
    const skippedChecks = result.skippedChecks || [];
    const riskScore = calculateRiskScore(findings);

    insertFindings(interaction.guildId, run.runId, findings);
    insertSkippedChecks(interaction.guildId, run.runId, skippedChecks);
    const finishedRun = finishAuditRun(interaction.guildId, run.runId, {
      status: 'completed',
      riskScore,
      summary: {
        heuristic: true,
        phase: 'logs-fase-1',
        days,
        requestedLimit: limit,
        entriesFetched: result.stats ? result.stats.entriesFetched : 0,
        entriesAnalyzed: result.stats ? result.stats.entriesAnalyzed : 0,
        findingCount: findings.length,
        skippedCheckCount: skippedChecks.length,
        actorSummary: (result.actorSummary || []).slice(0, 5).map((actor) => ({
          actorId: actor.actorId,
          actorName: actor.actorName,
          totalRelevantActions: actor.totalRelevantActions,
          highRiskActions: actor.highRiskActions,
          destructiveActions: actor.destructiveActions,
          firstSeen: actor.firstSeen,
          lastSeen: actor.lastSeen
        }))
      }
    });

    const embed = buildLogsEmbed({
      result,
      run: finishedRun,
      riskScore,
      language
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const finishedRun = finishAuditRun(interaction.guildId, run.runId, {
      status: 'failed',
      riskScore: 0,
      summary: {
        phase: 'logs-fase-1',
        error: 'logs-audit-failed'
      }
    });

    const failedMessage = language === 'es'
      ? 'No se pudo completar el análisis de registros. No se modificó ninguna configuración del servidor.'
      : 'Could not complete audit log analysis. No server configuration was changed.';

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(language === 'es' ? 'Driftwatch Logs' : 'Driftwatch Logs')
          .setDescription(failedMessage)
          .addFields({ name: 'Run', value: finishedRun.runId, inline: false })
          .setTimestamp(new Date())
      ]
    });
  }
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
  const source = interaction.options.getString('source') || 'latest';
  const runType = source === 'latest' ? null : source;
  const latestRun = getLatestAuditRun(interaction.guildId, runType);

  if (!latestRun) {
    const nextCommand = source === 'current-risk'
      ? '`/driftwatch check`'
      : source === 'baseline-compare'
        ? '`/driftwatch baseline action:compare`'
        : source === 'logs'
          ? '`/driftwatch logs`'
          : '`/driftwatch check`, `/driftwatch baseline action:compare`, or `/driftwatch logs`';
    const missingMessage = source === 'logs' && (guildConfig.language || process.env.DEFAULT_LANGUAGE) === 'es'
      ? 'No hay reporte de logs todavía. Ejecuta `/driftwatch logs` primero.'
      : `No ${source} report is available yet. Run ${nextCommand} first.`;

    await interaction.reply({
      content: missingMessage,
      ephemeral: true
    });
    return;
  }

  const findings = listFindingsByRun(interaction.guildId, latestRun.runId);
  const skippedChecks = listSkippedChecksByRun(interaction.guildId, latestRun.runId);

  const embed = buildReportEmbed({
    title: reportTitleForRunType(latestRun.runType),
    riskScore: latestRun.riskScore ?? calculateRiskScore(findings),
    findings,
    skippedChecks,
    run: latestRun,
    language: guildConfig.language || process.env.DEFAULT_LANGUAGE || 'en',
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

function reportTitleForRunType(runType) {
  if (runType === 'current-risk') return 'Driftwatch Current Risk Report';
  if (runType === 'baseline-compare') return 'Driftwatch Baseline Comparison Report';
  if (runType === 'logs') return 'Driftwatch Audit Log Report';
  return 'Driftwatch Report';
}

function buildLogsEmbed({ result, run, riskScore, language = 'en' }) {
  const findings = result.findings || [];
  const skippedChecks = result.skippedChecks || [];
  const stats = result.stats || {};
  const labels = language === 'es'
    ? {
        title: 'Driftwatch Logs',
        description: 'Análisis defensivo Fase 1 del registro de auditoría usando APIs oficiales de Discord. No se leyeron mensajes y no se modificó la configuración del servidor.',
        period: 'Periodo analizado',
        requestedLimit: 'Límite solicitado',
        analyzed: 'Entradas obtenidas/analizadas',
        riskScore: 'Puntuación de riesgo',
        runType: 'Tipo de análisis',
        severitySummary: 'Resumen de severidad',
        topActors: 'Top actores a revisar',
        timeline: 'Línea temporal compacta',
        findings: 'Hallazgos principales',
        recommendations: 'Recomendaciones',
        limitations: 'Limitaciones y comprobaciones omitidas',
        noData: 'Sin datos registrados.',
        note: 'Fase 1 usa heurísticas conservadoras. Señala posibles riesgos para revisión manual; no afirma compromiso ni certeza absoluta.'
      }
    : {
        title: 'Driftwatch Logs',
        description: 'Defensive Phase 1 audit log analysis using official Discord APIs. No messages were read and no server configuration was changed.',
        period: 'Period analyzed',
        requestedLimit: 'Requested limit',
        analyzed: 'Entries fetched/analyzed',
        riskScore: 'Risk score',
        runType: 'Run type',
        severitySummary: 'Severity summary',
        topActors: 'Top actors to review',
        timeline: 'Compact timeline',
        findings: 'Main findings',
        recommendations: 'Recommendations',
        limitations: 'Limitations and skipped checks',
        noData: 'No data recorded.',
        note: 'Phase 1 uses conservative heuristics. It highlights possible risks for manual review; it does not claim compromise or certainty.'
      };

  const topFindings = findings
    .slice(0, 6)
    .map((finding) => `**${finding.severity.toUpperCase()}** ${finding.title}`)
    .join('\n') || labels.noData;
  const recommendations = uniqueRecommendations(findings).join('\n') || labels.noData;

  return new EmbedBuilder()
    .setTitle(labels.title)
    .setDescription(labels.description)
    .addFields(
      { name: labels.period, value: language === 'es' ? `${stats.days || 7} día(s)` : `${stats.days || 7} day(s)`, inline: true },
      { name: labels.requestedLimit, value: String(stats.requestedLimit || 500), inline: true },
      { name: labels.analyzed, value: `${stats.entriesFetched || 0}/${stats.entriesAnalyzed || 0}`, inline: true },
      { name: labels.riskScore, value: String(riskScore), inline: true },
      { name: labels.runType, value: run.runType, inline: true },
      { name: labels.severitySummary, value: summarizeLogSeverities(findings, language), inline: false },
      { name: labels.topActors, value: formatTopActors(result.topActors, labels.noData, language), inline: false },
      { name: labels.timeline, value: formatTimeline(result.notableEvents, labels.noData, language), inline: false },
      { name: `${labels.findings} (${Math.min(findings.length, 6)} of ${findings.length})`, value: topFindings.slice(0, 1024), inline: false },
      { name: labels.recommendations, value: recommendations.slice(0, 1024), inline: false },
      { name: labels.limitations, value: formatLogsLimitations(skippedChecks, result.limitations, labels.noData), inline: false },
      { name: 'v0.1 note', value: labels.note, inline: false }
    )
    .setFooter({ text: 'Driftwatch v0.1 logs - safeToAutoFix is false' })
    .setTimestamp(run && (run.finishedAt || run.startedAt) ? new Date(run.finishedAt || run.startedAt) : new Date());
}

function formatTopActors(topActors = [], emptyText, language = 'en') {
  if (!topActors.length) return emptyText;
  return topActors
    .slice(0, 5)
    .map((actor) => {
      if (language === 'es') {
        return [
          `Actor: ${actor.actorName || actor.actorId}`,
          `Cambios relevantes: ${actor.totalRelevantActions || 0}`,
          `Cambios sensibles: ${actor.highRiskActions || 0}`,
          `Eliminaciones: ${actor.destructiveActions || 0}`,
          `Ventana: ${shortDateTime(actor.firstSeen)} -> ${shortDateTime(actor.lastSeen)}`
        ].join(' | ');
      }
      return [
        `Actor: ${actor.actorName || actor.actorId}`,
        `Relevant changes: ${actor.totalRelevantActions || 0}`,
        `Sensitive changes: ${actor.highRiskActions || 0}`,
        `Deletions: ${actor.destructiveActions || 0}`,
        `Window: ${shortDateTime(actor.firstSeen)} -> ${shortDateTime(actor.lastSeen)}`
      ].join(' | ');
    })
    .join('\n')
    .slice(0, 1024);
}

function summarizeLogSeverities(findings = [], language = 'en') {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) {
    if (Object.prototype.hasOwnProperty.call(counts, finding.severity)) {
      counts[finding.severity] += 1;
    }
  }
  const names = language === 'es'
    ? { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja', info: 'Info' }
    : { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
  return ['critical', 'high', 'medium', 'low', 'info']
    .map((severity) => `${names[severity]}: ${counts[severity]}`)
    .join(' | ');
}

function formatTimeline(events = [], emptyText, language = 'en') {
  if (!events.length) return emptyText;
  return events
    .slice(0, 8)
    .map((event) => {
      const by = language === 'es' ? 'por' : 'by';
      return `- ${shortTime(event.createdAt)} · ${event.label || event.action} · ${event.targetName || (language === 'es' ? 'objetivo no disponible' : 'target unavailable')} · ${by} ${event.actorName || 'unknown'}`;
    })
    .join('\n')
    .slice(0, 1024);
}

function shortTime(value) {
  if (!value) return '??:??';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16) || '??:??';
  return date.toISOString().slice(11, 16);
}

function shortDateTime(value) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function formatLogsLimitations(skippedChecks = [], limitations = [], emptyText) {
  const lines = [
    ...skippedChecks.map((item) => `- ${item.checkName}: ${item.reason}`),
    ...limitations.map((item) => `- ${item}`)
  ];
  return lines.length ? lines.slice(0, 5).join('\n').slice(0, 1024) : emptyText;
}

function uniqueRecommendations(findings = []) {
  const seen = new Set();
  const lines = [];
  for (const finding of findings) {
    if (!finding.recommendation || seen.has(finding.recommendation)) continue;
    seen.add(finding.recommendation);
    lines.push(`- ${finding.recommendation}`);
    if (lines.length >= 4) break;
  }
  return lines;
}

function clampNumber(value, fallback, min, max) {
  const number = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(min, Math.min(max, number));
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
  const config = getGuildConfig(interaction.guildId);
  const language = config.language || process.env.DEFAULT_LANGUAGE || 'en';

  await interaction.reply({
    content: helpMessage(language),
    ephemeral: true
  });
}

function setupMessage(language, configLanguage) {
  if (language === 'es') {
    return [
      'Driftwatch está listo para este servidor.',
      `Idioma: ${configLanguage}`,
      '',
      'Flujo recomendado:',
      '1. Ejecuta `/driftwatch check` para revisar riesgos actuales.',
      '2. Ejecuta `/driftwatch logs` para revisar cambios administrativos recientes.',
      '3. Corrige manualmente lo que consideres importante.',
      '4. Cuando el servidor esté en un estado aceptado, crea un baseline.',
      '',
      'Importante: un baseline no significa que el servidor sea seguro. Solo guarda una referencia para comparar cambios futuros.',
      'Driftwatch v0.1 no realiza cambios destructivos en el servidor.'
    ].join('\n');
  }

  return [
    'Driftwatch is ready for this server.',
    `Language: ${configLanguage}`,
    '',
    'Recommended flow:',
    '1. Run `/driftwatch check` to review current risks.',
    '2. Run `/driftwatch logs` to review recent administrative changes.',
    '3. Manually review and fix what matters.',
    '4. When the server is in an accepted state, create a baseline.',
    '',
    'Important: a baseline does not mean the server is secure. It only stores a reference point for future comparisons.',
    'Driftwatch v0.1 will not make destructive server changes.'
  ].join('\n');
}

function helpMessage(language) {
  if (language === 'es') {
    return [
      'Primero revisa. Luego fija una referencia. Después vigila cambios.',
      '',
      'Flujo recomendado:',
      '1. `/driftwatch setup`',
      '2. `/driftwatch check`',
      '3. `/driftwatch logs`',
      '4. Revisa y corrige manualmente lo importante',
      '5. `/driftwatch baseline action:create`',
      '6. En futuras revisiones: `/driftwatch baseline action:compare`',
      '',
      'Comandos:',
      '`/driftwatch baseline action:create|list|compare` - gestionar referencias baseline',
      '`/driftwatch report source:latest|current-risk|baseline-compare|logs` - mostrar hallazgos guardados',
      '`/driftwatch data` - explicar datos locales y retención',
      "`/driftwatch delete-data confirm:true` - borrar datos locales de este servidor"
    ].join('\n');
  }

  return [
    'First review. Then set a reference. Then monitor changes.',
    '',
    'Recommended flow:',
    '1. `/driftwatch setup`',
    '2. `/driftwatch check`',
    '3. `/driftwatch logs`',
    '4. Manually review and fix what matters',
    '5. `/driftwatch baseline action:create`',
    '6. In future reviews: `/driftwatch baseline action:compare`',
    '',
    'Commands:',
    '`/driftwatch baseline action:create|list|compare` - manage baseline references',
    '`/driftwatch report source:latest|current-risk|baseline-compare|logs` - show stored report findings',
    '`/driftwatch data` - explain local data and retention',
    "`/driftwatch delete-data confirm:true` - delete this guild's local Driftwatch data"
  ].join('\n');
}

function baselineCreateCopy(language) {
  if (language === 'es') {
    return {
      title: 'Baseline creado',
      description: [
        'Esto es una foto segura del estado actual, no una garantía de seguridad.',
        'Úsalo como referencia solo si ya has revisado los riesgos principales y aceptas este estado como válido.',
        'Modo seguro: no he cambiado nada en el servidor.',
        'No se recopilaron mensajes, DMs, tokens, emails, contraseñas, IPs ni logs crudos.'
      ].join('\n')
    };
  }

  return {
    title: 'Baseline Created',
    description: [
      'This is a safe snapshot of the current state, not a security guarantee.',
      'Use it as a reference only if you have reviewed the main risks and accept this state as valid.',
      'Safe mode: no server configuration was changed.',
      'No messages, DMs, tokens, emails, passwords, IPs, or raw logs were collected.'
    ].join('\n')
  };
}

module.exports = { execute };
