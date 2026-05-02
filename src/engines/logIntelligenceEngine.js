const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { createFinding } = require('../models/finding');
const { Severity } = require('../models/severity');
const { Categories } = require('../models/categories');
const { safeName } = require('../utils/safeNames');

const TEN_MINUTES_MS = 10 * 60 * 1000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

const dangerousPermissions = [
  ['Administrator', PermissionFlagsBits.Administrator],
  ['ManageGuild', PermissionFlagsBits.ManageGuild],
  ['ManageRoles', PermissionFlagsBits.ManageRoles],
  ['ManageChannels', PermissionFlagsBits.ManageChannels],
  ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],
  ['BanMembers', PermissionFlagsBits.BanMembers],
  ['KickMembers', PermissionFlagsBits.KickMembers],
  ['MentionEveryone', PermissionFlagsBits.MentionEveryone]
];

const adminActionNames = new Set([
  'GuildUpdate',
  'ChannelCreate',
  'ChannelUpdate',
  'ChannelDelete',
  'RoleCreate',
  'RoleUpdate',
  'RoleDelete',
  'WebhookCreate',
  'WebhookUpdate',
  'WebhookDelete',
  'InviteCreate',
  'InviteDelete',
  'MemberBanAdd',
  'MemberKick'
]);

const destructiveActionNames = new Set(['RoleDelete', 'ChannelDelete']);
const highRiskActionNames = new Set([
  'GuildUpdate',
  'RoleUpdate',
  'RoleDelete',
  'ChannelDelete',
  'WebhookCreate',
  'WebhookDelete',
  'MemberBanAdd',
  'MemberKick'
]);
const webhookActionNames = new Set(['WebhookCreate', 'WebhookUpdate', 'WebhookDelete']);
const inviteActionNames = new Set(['InviteCreate', 'InviteDelete']);
const channelPermissionActionNames = new Set(['ChannelOverwriteCreate', 'ChannelOverwriteUpdate', 'ChannelOverwriteDelete']);
const guildConfigActionNames = new Set(['GuildUpdate']);
const automodActionNames = new Set([
  'AutoModerationRuleCreate',
  'AutoModerationRuleUpdate',
  'AutoModerationRuleDelete',
  'AutoModerationBlockMessage',
  'AutoModerationFlagToChannel',
  'AutoModerationUserCommunicationDisabled'
]);

async function analyzeAuditLogs(options = {}) {
  const guild = options.guild;
  const days = clampNumber(options.days, 7, 1, 45);
  const limit = clampNumber(options.limit, 500, 50, 1000);
  const language = options.language || 'en';
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const skippedChecks = [];
  const limitations = [];

  if (!guild) {
    return emptyResult(days, limit, language, {
      checkName: 'audit-log-guild',
      reason: text(language, 'No se pudo analizar el registro de auditoría porque no hay contexto de servidor.', 'Audit log analysis could not run because no guild context was available.')
    });
  }

  const botMember = guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    return emptyResult(days, limit, language, {
      checkName: 'audit-log-access',
      reason: text(language, 'Se omitió el análisis del registro de auditoría porque falta el permiso Ver registro de auditoría.', 'Audit log analysis was skipped because the bot is missing View Audit Log.'),
      missingPermission: 'ViewAuditLog'
    });
  }

  const fetched = await fetchRecentAuditLogEntries(guild, { limit, cutoff, skippedChecks, limitations, language });
  const entries = fetched.entries;
  const classifiedEntries = entries.map(classifyEntry);
  const actorSummary = buildActorSummary(classifiedEntries);
  const findings = [];
  const permissionLimitations = [];

  findings.push(...detectConcentratedAdminActivity(classifiedEntries, language));
  findings.push(...detectHighRiskBursts(classifiedEntries, language));
  findings.push(...detectDestructiveBursts(classifiedEntries, language));
  findings.push(...detectWebhookCreates(classifiedEntries, language));
  findings.push(...detectInviteCreates(classifiedEntries, language));
  findings.push(...detectRolePermissionGains(classifiedEntries, language, permissionLimitations));

  for (const limitation of permissionLimitations.slice(0, 5)) {
    skippedChecks.push({
      checkName: 'role-permission-change-parse',
      reason: limitation
    });
  }

  limitations.push(...defaultLimitations(language));

  const summary = buildSummary({ days, limit, fetched, findings, skippedChecks, language });

  return {
    summary,
    findings,
    skippedChecks,
    notableEvents: buildNotableTimeline(classifiedEntries, language),
    topActors: actorSummary.slice(0, 5),
    actorSummary,
    limitations,
    stats: {
      days,
      requestedLimit: limit,
      entriesFetched: fetched.entriesFetched,
      entriesAnalyzed: entries.length,
      pagesFetched: fetched.pagesFetched,
      cutoff: new Date(cutoff).toISOString(),
      apiLimited: fetched.apiLimited
    }
  };
}

async function fetchRecentAuditLogEntries(guild, { limit, cutoff, skippedChecks, limitations, language }) {
  const entries = [];
  let before;
  let pagesFetched = 0;
  let stopReason = null;
  const maxPages = Math.min(MAX_PAGES, Math.ceil(limit / PAGE_LIMIT));

  while (entries.length < limit && pagesFetched < maxPages) {
    let auditLogs;
    try {
      auditLogs = await guild.fetchAuditLogs({
        limit: Math.min(PAGE_LIMIT, limit - entries.length),
        before
      });
    } catch (error) {
      skippedChecks.push({
        checkName: 'audit-log-fetch',
        reason: text(language, 'No se pudo continuar leyendo el registro de auditoría con la API oficial de Discord.', 'Could not continue reading audit logs through the official Discord API.')
      });
      stopReason = 'fetch-error';
      break;
    }

    const pageEntries = Array.from(auditLogs.entries.values());
    pagesFetched += 1;
    if (pageEntries.length === 0) {
      stopReason = 'no-more-entries';
      break;
    }

    for (const entry of pageEntries) {
      if (entry.createdTimestamp < cutoff) {
        stopReason = 'older-than-cutoff';
        break;
      }
      entries.push(entry);
      if (entries.length >= limit) break;
    }

    const last = pageEntries[pageEntries.length - 1];
    before = last && last.id;

    if (stopReason || pageEntries.length < PAGE_LIMIT) break;
  }

  const apiLimited = entries.length < limit && pagesFetched >= maxPages && !stopReason;
  if (apiLimited) {
    limitations.push(text(language, 'Fase 1 limita la paginación conservadora del registro de auditoría para evitar lecturas agresivas.', 'Phase 1 uses conservative audit-log pagination to avoid aggressive reads.'));
  }

  return {
    entries,
    entriesFetched: entries.length,
    pagesFetched,
    stopReason: stopReason || (entries.length >= limit ? 'requested-limit' : 'page-limit'),
    apiLimited
  };
}

function detectConcentratedAdminActivity(entries, language) {
  const findings = [];
  const byActor = groupByActor(entries.filter((entry) => entry.classification.isRelevantAdminAction));

  for (const [actorId, actorEntries] of byActor) {
    const window = firstWindow(actorEntries, 5, TEN_MINUTES_MS);
    if (!window) continue;
    const actorName = safeActorName(window[0]);
    findings.push(createFinding({
      ruleId: 'logs-admin-activity-burst',
      severity: Severity.MEDIUM,
      category: Categories.LOGS,
      title: text(language, 'Actividad administrativa concentrada', 'Concentrated administrative activity'),
      assetType: 'audit-log',
      assetId: actorId,
      assetName: actorName,
      actorId,
      actorName,
      impact: text(language, 'Varias acciones administrativas sensibles se concentraron en una ventana corta. Puede ser actividad legítima, pero conviene revisarla.', 'Several sensitive administrative actions happened in a short window. It may be legitimate, but should be reviewed.'),
      likelihood: 'medium',
      evidence: [
        { type: 'timeWindow', value: '10 minutes' },
        { type: 'count', value: window.length },
        { type: 'actions', value: compactActionCounts(window) }
      ],
      recommendation: text(language, 'Revisa con el equipo autorizado si estos cambios estaban previstos y documentados.', 'Review with authorized staff whether these changes were expected and documented.'),
      confidence: 0.72
    }));
  }

  return findings;
}

function detectHighRiskBursts(entries, language) {
  const findings = [];
  const byActor = groupByActor(entries.filter((entry) => entry.classification.isHighRiskAction));

  for (const [actorId, actorEntries] of byActor) {
    const window = firstWindow(actorEntries, 3, 15 * 60 * 1000);
    if (!window) continue;
    const actorName = safeActorName(window[0]);
    findings.push(createFinding({
      ruleId: 'logs-high-risk-activity-burst',
      severity: Severity.HIGH,
      category: Categories.LOGS,
      title: text(language, 'Cambios sensibles concentrados por un actor', 'Concentrated high-risk changes by one actor'),
      assetType: 'audit-log',
      assetId: actorId,
      assetName: actorName,
      actorId,
      actorName,
      impact: text(language, 'Varias acciones sensibles aparecen concentradas en una ventana corta. Puede ser mantenimiento legítimo, pero conviene revisar la secuencia.', 'Several sensitive actions appear concentrated in a short window. It may be legitimate maintenance, but the sequence should be reviewed.'),
      likelihood: 'medium',
      evidence: [
        { type: 'timeWindow', value: '15 minutes' },
        { type: 'count', value: window.length },
        { type: 'actions', value: compactActionCounts(window) }
      ],
      recommendation: text(language, 'Revisa la secuencia de cambios de ese actor en el audit log de Discord y confirma que estaban previstos.', 'Review this actor sequence in Discord audit logs and confirm the changes were expected.'),
      confidence: 0.76
    }));
  }

  return findings;
}

function detectDestructiveBursts(entries, language) {
  const findings = [];
  const destructive = entries.filter((entry) => entry.classification.isDestructiveAction);
  const byActor = groupByActor(destructive);

  for (const [actorId, actorEntries] of byActor) {
    const window = firstWindow(actorEntries, 3, TEN_MINUTES_MS);
    if (!window) continue;
    const actorName = safeActorName(window[0]);
    findings.push(createFinding({
      ruleId: 'logs-sensitive-delete-burst',
      severity: Severity.HIGH,
      category: Categories.LOGS,
      title: text(language, 'Varias eliminaciones sensibles en poco tiempo', 'Several sensitive deletions in a short time'),
      assetType: 'audit-log',
      assetId: actorId,
      assetName: actorName,
      actorId,
      actorName,
      impact: text(language, 'Se detectaron varias eliminaciones de roles o canales en una ventana corta. Es una señal que merece revisión manual.', 'Several role or channel deletions were detected in a short window. This is a signal worth manual review.'),
      likelihood: 'medium',
      evidence: [
        { type: 'timeWindow', value: '10 minutes' },
        { type: 'count', value: window.length },
        { type: 'actions', value: compactActionCounts(window) }
      ],
      recommendation: text(language, 'Confirma que las eliminaciones fueron autorizadas y que no afectaron a canales, roles o permisos importantes.', 'Confirm the deletions were authorized and did not affect important channels, roles, or permissions.'),
      confidence: 0.78
    }));
  }

  return findings;
}

function detectWebhookCreates(entries, language) {
  return entries
    .filter((entry) => entry.actionName === 'WebhookCreate')
    .slice(0, 10)
    .map((entry) => createFinding({
      ruleId: 'logs-webhook-created',
      severity: Severity.MEDIUM,
      category: Categories.WEBHOOKS,
      title: text(language, 'Webhook creado recientemente', 'Webhook created recently'),
      assetType: 'webhook',
      assetId: targetId(entry),
      assetName: targetName(entry),
      actorId: entry.executorId || null,
      actorName: safeActorName(entry),
      impact: text(language, 'Los webhooks pueden publicar en canales. Driftwatch no lee contenido ni obtiene datos del webhook; solo señala la creación registrada.', 'Webhooks can publish to channels. Driftwatch does not read content or fetch webhook data; it only flags the recorded creation.'),
      likelihood: 'medium',
      evidence: [
        { type: 'action', value: 'WebhookCreate' },
        { type: 'target', value: targetName(entry) || targetId(entry) || 'unknown' },
        { type: 'createdAt', value: createdAtIso(entry) }
      ],
      recommendation: text(language, 'Revisa que el webhook sea esperado y limita quién puede gestionar webhooks.', 'Review whether the webhook is expected and limit who can manage webhooks.'),
      confidence: 0.82
    }));
}

function detectInviteCreates(entries, language) {
  return entries
    .filter((entry) => entry.actionName === 'InviteCreate')
    .slice(0, 10)
    .map((entry) => {
      const inviteData = readInviteData(entry);
      const unrestricted = inviteData.maxUses === 0 || inviteData.maxAge === 0;
      const severity = unrestricted ? Severity.MEDIUM : Severity.LOW;
      const limitation = inviteData.available
        ? null
        : text(language, 'Los datos de límite o expiración de la invitación no estaban disponibles en la entrada analizada.', 'Invite max-use or expiration data was not available in the analyzed entry.');

      return createFinding({
        ruleId: unrestricted ? 'logs-invite-created-unrestricted' : 'logs-invite-created',
        severity,
        category: Categories.INVITES,
        title: text(language, 'Invitación creada recientemente', 'Invite created recently'),
        assetType: 'invite',
        assetId: targetId(entry),
        assetName: targetName(entry),
        actorId: entry.executorId || null,
        actorName: safeActorName(entry),
        impact: unrestricted
          ? text(language, 'La invitación parece tener límites amplios o no definidos. Conviene revisar si sigue siendo necesaria.', 'The invite appears to have broad or undefined limits. It should be reviewed.')
          : text(language, 'Se registró la creación de una invitación. Puede ser normal, pero conviene revisar invitaciones activas periódicamente.', 'An invite creation was recorded. This may be normal, but active invites should be reviewed periodically.'),
        likelihood: unrestricted ? 'medium' : 'low',
        evidence: [
          { type: 'action', value: 'InviteCreate' },
          { type: 'maxUses', value: inviteData.maxUses ?? 'unknown' },
          { type: 'maxAge', value: inviteData.maxAge ?? 'unknown' },
          ...(limitation ? [{ type: 'limitation', value: limitation }] : [])
        ],
        recommendation: text(language, 'Revisa invitaciones recientes y elimina las que no sean necesarias.', 'Review recent invites and remove those that are not needed.'),
        confidence: inviteData.available ? 0.72 : 0.55
      });
    });
}

function detectRolePermissionGains(entries, language, limitations) {
  const findings = [];
  const roleUpdates = entries.filter((entry) => entry.classification.isRolePermissionAction);

  for (const entry of roleUpdates) {
    const permissionChange = readPermissionChange(entry);
    if (!permissionChange) continue;
    if (!permissionChange.parseable) {
      limitations.push(text(language, 'Una actualización de rol incluía permisos, pero el formato old/new no se pudo interpretar de forma segura.', 'A role update included permissions, but old/new values could not be safely parsed.'));
      continue;
    }

    const gained = gainedDangerousPermissions(permissionChange.oldBits, permissionChange.newBits);
    for (const permission of gained) {
      findings.push(createFinding({
        ruleId: permission.name === 'Administrator' ? 'logs-role-gained-administrator' : 'logs-role-gained-dangerous-permission',
        severity: permission.name === 'Administrator' ? Severity.CRITICAL : Severity.HIGH,
        category: Categories.PERMISSIONS,
        title: text(language, `Rol ganó permiso peligroso: ${permission.name}`, `Role gained dangerous permission: ${permission.name}`),
        assetType: 'role',
        assetId: targetId(entry),
        assetName: targetName(entry),
        previousValue: permissionChange.oldBits.toString(),
        currentValue: permissionChange.newBits.toString(),
        actorId: entry.executorId || null,
        actorName: safeActorName(entry),
        impact: text(language, 'Un rol ganó un permiso sensible según el registro de auditoría. Este cambio puede aumentar la exposición si no estaba previsto.', 'A role gained a sensitive permission according to audit logs. This can increase exposure if it was not expected.'),
        likelihood: permission.name === 'Administrator' ? 'high' : 'medium',
        evidence: [
          { type: 'action', value: 'RoleUpdate' },
          { type: 'permissionGained', value: permission.name },
          { type: 'target', value: targetName(entry) || targetId(entry) || 'unknown' }
        ],
        recommendation: text(language, 'Revisa el rol afectado y confirma que esos permisos siguen siendo necesarios.', 'Review the affected role and confirm those permissions are still needed.'),
        confidence: 0.86
      }));
    }
  }

  return findings;
}

function readInviteData(entry) {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  const maxUses = readChangeValue(changes, 'max_uses');
  const maxAge = readChangeValue(changes, 'max_age');
  return {
    maxUses: normalizeNumber(maxUses),
    maxAge: normalizeNumber(maxAge),
    available: maxUses !== undefined || maxAge !== undefined
  };
}

function readPermissionChange(entry) {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  const permissions = changes.find((change) => change && change.key === 'permissions');
  if (!permissions) return null;

  const oldBits = parsePermissionBits(permissions.old);
  const newBits = parsePermissionBits(permissions.new);
  if (oldBits === null || newBits === null) {
    return { parseable: false };
  }

  return { parseable: true, oldBits, newBits };
}

function readChangeValue(changes, key) {
  const change = changes.find((item) => item && item.key === key);
  if (!change) return undefined;
  return change.new ?? change.old;
}

function parsePermissionBits(value) {
  if (value === undefined || value === null) return null;
  try {
    return BigInt(value);
  } catch (error) {
    return null;
  }
}

function gainedDangerousPermissions(oldBits, newBits) {
  return dangerousPermissions
    .filter(([, bit]) => (oldBits & bit) === 0n && (newBits & bit) !== 0n)
    .map(([name, bit]) => ({ name, bit }));
}

function buildSummary({ days, limit, fetched, findings, skippedChecks, language }) {
  if (language === 'es') {
    return `Análisis de registros completado para ${days} día(s). Solicitado: ${limit}. Analizadas: ${fetched.entries.length}. Hallazgos: ${findings.length}. Omitidas/limitadas: ${skippedChecks.length}.`;
  }
  return `Audit log analysis completed for ${days} day(s). Requested: ${limit}. Analyzed: ${fetched.entries.length}. Findings: ${findings.length}. Skipped/limited: ${skippedChecks.length}.`;
}

function emptyResult(days, limit, language, skippedCheck) {
  return {
    summary: text(language, 'Análisis de registros omitido o limitado.', 'Audit log analysis skipped or limited.'),
    findings: [],
    skippedChecks: [skippedCheck],
    notableEvents: [],
    topActors: [],
    actorSummary: [],
    limitations: [skippedCheck.reason],
    stats: {
      days,
      requestedLimit: limit,
      entriesFetched: 0,
      entriesAnalyzed: 0,
      pagesFetched: 0,
      cutoff: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      apiLimited: true
    }
  };
}

function classifyEntry(entry) {
  const name = actionName(entry.action);
  const permissionChange = readPermissionChange(entry);
  const isRoleUpdate = name === 'RoleUpdate';

  return {
    ...entry,
    actionName: name,
    classification: {
      isRelevantAdminAction: adminActionNames.has(name) || channelPermissionActionNames.has(name) || automodActionNames.has(name),
      isHighRiskAction: highRiskActionNames.has(name) || gainedDangerousPermissionsFromChange(permissionChange).length > 0,
      isDestructiveAction: destructiveActionNames.has(name),
      isWebhookAction: webhookActionNames.has(name),
      isInviteAction: inviteActionNames.has(name),
      isRolePermissionAction: isRoleUpdate && Boolean(permissionChange),
      isChannelPermissionAction: channelPermissionActionNames.has(name),
      isGuildConfigAction: guildConfigActionNames.has(name),
      isAutomodAction: automodActionNames.has(name)
    },
    derivedPermissionChange: permissionChange
  };
}

function buildActorSummary(entries) {
  const summaries = new Map();
  for (const entry of entries.filter((item) => item.classification.isRelevantAdminAction)) {
    const actorId = entry.executorId || 'unknown';
    const current = summaries.get(actorId) || {
      actorId,
      actorName: safeActorName(entry),
      totalRelevantActions: 0,
      highRiskActions: 0,
      destructiveActions: 0,
      webhookActions: 0,
      inviteActions: 0,
      rolePermissionActions: 0,
      firstSeen: createdAtIso(entry),
      lastSeen: createdAtIso(entry)
    };

    current.totalRelevantActions += 1;
    if (entry.classification.isHighRiskAction) current.highRiskActions += 1;
    if (entry.classification.isDestructiveAction) current.destructiveActions += 1;
    if (entry.classification.isWebhookAction) current.webhookActions += 1;
    if (entry.classification.isInviteAction) current.inviteActions += 1;
    if (entry.classification.isRolePermissionAction) current.rolePermissionActions += 1;

    if (entry.createdTimestamp < new Date(current.firstSeen).getTime()) {
      current.firstSeen = createdAtIso(entry);
    }
    if (entry.createdTimestamp > new Date(current.lastSeen).getTime()) {
      current.lastSeen = createdAtIso(entry);
    }

    summaries.set(actorId, current);
  }

  return Array.from(summaries.values()).sort((a, b) => {
    if (b.highRiskActions !== a.highRiskActions) return b.highRiskActions - a.highRiskActions;
    if (b.destructiveActions !== a.destructiveActions) return b.destructiveActions - a.destructiveActions;
    if (b.totalRelevantActions !== a.totalRelevantActions) return b.totalRelevantActions - a.totalRelevantActions;
    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
  });
}

function buildNotableTimeline(entries, language) {
  return entries
    .filter((entry) => entry.classification.isHighRiskAction || entry.classification.isDestructiveAction || entry.classification.isWebhookAction || entry.classification.isInviteAction || entry.classification.isGuildConfigAction || entry.classification.isChannelPermissionAction)
    .sort((a, b) => {
      const severityDiff = timelinePriority(b) - timelinePriority(a);
      if (severityDiff !== 0) return severityDiff;
      return b.createdTimestamp - a.createdTimestamp;
    })
    .slice(0, 8)
    .map((entry) => ({
      action: entry.actionName,
      label: actionLabel(entry.actionName, language),
      actorName: safeActorName(entry),
      targetName: targetName(entry) || targetId(entry) || text(language, 'objetivo no disponible', 'target unavailable'),
      createdAt: createdAtIso(entry)
    }));
}

function timelinePriority(entry) {
  if (entry.actionName === 'RoleUpdate' && gainedDangerousPermissionsFromChange(entry.derivedPermissionChange).some((item) => item.name === 'Administrator')) return 5;
  if (entry.classification.isHighRiskAction) return 4;
  if (entry.classification.isDestructiveAction) return 3;
  if (entry.classification.isWebhookAction) return 2;
  if (entry.classification.isInviteAction) return 1;
  return 0;
}

function groupByActor(entries) {
  const map = new Map();
  for (const entry of entries) {
    const actorId = entry.executorId || 'unknown';
    const items = map.get(actorId) || [];
    items.push(entry);
    map.set(actorId, items);
  }
  for (const items of map.values()) {
    items.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  }
  return map;
}

function firstWindow(entries, threshold, windowMs) {
  for (let index = 0; index < entries.length; index += 1) {
    const start = entries[index].createdTimestamp;
    const window = entries.filter((entry) => entry.createdTimestamp >= start && entry.createdTimestamp <= start + windowMs);
    if (window.length >= threshold) return window;
  }
  return null;
}

function compactActionCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    const name = entry.actionName || actionName(entry.action);
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

function gainedDangerousPermissionsFromChange(permissionChange) {
  if (!permissionChange || !permissionChange.parseable) return [];
  return gainedDangerousPermissions(permissionChange.oldBits, permissionChange.newBits);
}

function defaultLimitations(language) {
  return [
    text(language, 'Los datos del registro de auditoría dependen de la disponibilidad y retención de Discord.', 'Audit log data depends on Discord availability and retention.'),
    text(language, 'Algunos detalles de cambios pueden no estar expuestos o no ser interpretables de forma segura.', 'Some change details may not be exposed or safely parseable.'),
    text(language, 'Driftwatch v0.1 no prueba compromiso; solo muestra señales para revisión autorizada.', 'Driftwatch v0.1 does not prove compromise; it only highlights signals for authorized review.'),
    text(language, 'Driftwatch v0.1 no modifica la configuración del servidor.', 'Driftwatch v0.1 does not modify server configuration.'),
    text(language, 'Solo se almacenan hallazgos derivados, resúmenes y comprobaciones omitidas.', 'Only derived findings, summaries, and skipped checks are stored.')
  ];
}

function actionLabel(name, language) {
  if (language !== 'es') return name;
  const labels = {
    GuildUpdate: 'Servidor actualizado',
    ChannelCreate: 'Canal creado',
    ChannelUpdate: 'Canal actualizado',
    ChannelDelete: 'Canal eliminado',
    RoleCreate: 'Rol creado',
    RoleUpdate: 'Rol actualizado',
    RoleDelete: 'Rol eliminado',
    WebhookCreate: 'Webhook creado',
    WebhookUpdate: 'Webhook actualizado',
    WebhookDelete: 'Webhook eliminado',
    InviteCreate: 'Invitación creada',
    InviteDelete: 'Invitación eliminada',
    MemberBanAdd: 'Ban registrado',
    MemberKick: 'Expulsión registrada',
    ChannelOverwriteCreate: 'Permiso de canal creado',
    ChannelOverwriteUpdate: 'Permiso de canal actualizado',
    ChannelOverwriteDelete: 'Permiso de canal eliminado',
    AutoModerationRuleCreate: 'Regla AutoMod creada',
    AutoModerationRuleUpdate: 'Regla AutoMod actualizada',
    AutoModerationRuleDelete: 'Regla AutoMod eliminada'
  };
  return labels[name] || name;
}

function actionName(action) {
  return AuditLogEvent[action] || String(action || 'unknown');
}

function targetId(entry) {
  return entry.targetId || (entry.target && entry.target.id) || null;
}

function targetName(entry) {
  if (!entry.target) return null;
  return safeName(entry.target.name || entry.target.username || entry.target.tag || entry.targetId || null);
}

function safeActorName(entry) {
  return safeName(entry.executor ? (entry.executor.tag || entry.executor.username || entry.executor.id) : entry.executorId || 'unknown');
}

function createdAtIso(entry) {
  return entry.createdAt ? entry.createdAt.toISOString() : new Date(entry.createdTimestamp || Date.now()).toISOString();
}

function normalizeNumber(value) {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function clampNumber(value, fallback, min, max) {
  const number = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(min, Math.min(max, number));
}

function text(language, es, en) {
  return language === 'es' ? es : en;
}

module.exports = { analyzeAuditLogs };
