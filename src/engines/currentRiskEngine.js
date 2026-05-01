const { PermissionFlagsBits } = require('discord.js');
const { createFinding } = require('../models/finding');
const { Severity } = require('../models/severity');
const { Categories } = require('../models/categories');
const { safeName } = require('../utils/safeNames');

const dangerousPermissions = [
  ['Administrator', PermissionFlagsBits.Administrator],
  ['ManageRoles', PermissionFlagsBits.ManageRoles],
  ['ManageGuild', PermissionFlagsBits.ManageGuild],
  ['ManageChannels', PermissionFlagsBits.ManageChannels],
  ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],
  ['BanMembers', PermissionFlagsBits.BanMembers],
  ['KickMembers', PermissionFlagsBits.KickMembers],
  ['MentionEveryone', PermissionFlagsBits.MentionEveryone],
  ['ManageMessages', PermissionFlagsBits.ManageMessages],
  ['ManageEvents', PermissionFlagsBits.ManageEvents],
  ['ManageThreads', PermissionFlagsBits.ManageThreads]
];

const highRiskPermissions = new Set(['ManageRoles', 'ManageGuild', 'ManageChannels', 'ManageWebhooks']);
const moderationRiskPermissions = new Set(['BanMembers', 'KickMembers', 'MentionEveryone']);
const mediumRiskPermissions = new Set(['ManageMessages', 'ManageEvents', 'ManageThreads']);
const sensitiveChannelPattern = /\b(staff|mod|admin|logs?|audit|private|ticket|soporte|moderacion|moderación|administracion|administración)\b/i;

function evaluateCurrentRisk(guild) {
  const findings = [];
  const skippedChecks = [
    {
      checkName: 'member_specific_risk',
      reason: 'Member-specific risk analysis is skipped in v0.1. Driftwatch does not fetch all members or require Guild Members Intent.',
      missingPermission: null
    },
    {
      checkName: 'sensitive_channel_heuristic',
      reason: 'Sensitive channel detection uses a conservative name-based heuristic and is not a certainty guarantee.',
      missingPermission: null
    }
  ];

  evaluateRoles(guild, findings);
  evaluateEveryone(guild, findings);
  evaluateChannels(guild, findings);

  return {
    findings,
    skippedChecks,
    summary: 'v0.1 current risk checks completed from cached guild configuration. No messages were read and no server configuration was changed.'
  };
}

function evaluateRoles(guild, findings) {
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id) continue;

    for (const [permissionName, permissionBit] of dangerousPermissions) {
      if (!hasPermissionBit(role.permissions, permissionBit)) continue;

      const managed = Boolean(role.managed);
      findings.push(createFinding({
        ruleId: `current.role.${permissionName}.present`,
        severity: severityForRolePermission(permissionName, managed),
        category: managed ? Categories.BOTS : Categories.PERMISSIONS,
        title: `${safeName(role.name)} has ${permissionName}`,
        assetType: 'role',
        assetId: role.id,
        assetName: safeName(role.name),
        previousValue: null,
        currentValue: role.permissions.bitfield.toString(),
        impact: impactForPermission(permissionName, managed),
        likelihood: permissionName === 'Administrator' ? 'high' : 'medium',
        evidence: [`Role ${safeName(role.name)} currently includes ${permissionName}.`],
        recommendation: recommendationForPermission(permissionName, managed),
        confidence: 0.9
      }));
    }
  }
}

function evaluateEveryone(guild, findings) {
  const everyone = guild.roles.everyone;
  if (!everyone) return;

  for (const [permissionName, permissionBit] of dangerousPermissions) {
    if (!hasPermissionBit(everyone.permissions, permissionBit)) continue;

    findings.push(createFinding({
      ruleId: `current.everyone.${permissionName}.present`,
      severity: severityForEveryonePermission(permissionName),
      category: Categories.PERMISSIONS,
      title: `@everyone has ${permissionName}`,
      assetType: 'role',
      assetId: everyone.id,
      assetName: '@everyone',
      previousValue: null,
      currentValue: everyone.permissions.bitfield.toString(),
      impact: `${permissionName} on @everyone affects the broadest possible role and should be reviewed carefully.`,
      likelihood: highRiskPermissions.has(permissionName) || permissionName === 'Administrator' ? 'high' : 'medium',
      evidence: [`@everyone currently includes ${permissionName}.`],
      recommendation: 'Review @everyone permissions and keep broad permissions disabled unless there is a clearly documented administrative reason.',
      confidence: 0.95
    }));
  }
}

function evaluateChannels(guild, findings) {
  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites || !channel.permissionOverwrites.cache) continue;

    const channelName = safeName(channel.name);
    const looksSensitive = sensitiveChannelPattern.test(channelName);
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.id);
    if (!everyoneOverwrite) continue;

    const allowsView = everyoneOverwrite.allow.has(PermissionFlagsBits.ViewChannel);
    const allowsSend = everyoneOverwrite.allow.has(PermissionFlagsBits.SendMessages);

    if (looksSensitive && allowsView) {
      findings.push(createFinding({
        ruleId: 'current.channel.sensitive.everyone_view',
        severity: Severity.CRITICAL,
        category: Categories.CHANNELS,
        title: 'Sensitive-looking channel allows @everyone visibility',
        assetType: 'channel',
        assetId: channel.id,
        assetName: channelName,
        previousValue: null,
        currentValue: overwriteSummary(everyoneOverwrite),
        impact: 'A sensitive-looking channel may be broadly visible based on explicit @everyone overwrites.',
        likelihood: 'medium',
        evidence: [`Channel name matched the v0.1 sensitive-channel heuristic and @everyone is explicitly allowed View Channel.`],
        recommendation: 'Review the channel overwrite and confirm whether broad visibility is intentional.',
        confidence: 0.75
      }));
    }

    if (looksSensitive && allowsSend) {
      findings.push(createFinding({
        ruleId: 'current.channel.sensitive.everyone_send',
        severity: Severity.MEDIUM,
        category: Categories.CHANNELS,
        title: 'Sensitive-looking channel allows @everyone to send messages',
        assetType: 'channel',
        assetId: channel.id,
        assetName: channelName,
        previousValue: null,
        currentValue: overwriteSummary(everyoneOverwrite),
        impact: 'A sensitive-looking channel may allow broad posting based on explicit @everyone overwrites.',
        likelihood: 'medium',
        evidence: [`Channel name matched the v0.1 sensitive-channel heuristic and @everyone is explicitly allowed Send Messages.`],
        recommendation: 'Review whether @everyone should be able to send messages in this channel.',
        confidence: 0.75
      }));
    }
  }
}

function severityForRolePermission(permissionName, managed) {
  if (permissionName === 'Administrator') return managed ? Severity.HIGH : Severity.CRITICAL;
  if (managed && highRiskPermissions.has(permissionName)) return Severity.HIGH;
  if (highRiskPermissions.has(permissionName)) return Severity.HIGH;
  if (moderationRiskPermissions.has(permissionName)) return Severity.HIGH;
  if (mediumRiskPermissions.has(permissionName)) return managed ? Severity.HIGH : Severity.MEDIUM;
  return Severity.MEDIUM;
}

function severityForEveryonePermission(permissionName) {
  if (permissionName === 'Administrator') return Severity.CRITICAL;
  if (highRiskPermissions.has(permissionName)) return Severity.CRITICAL;
  if (moderationRiskPermissions.has(permissionName)) return Severity.HIGH;
  return Severity.MEDIUM;
}

function impactForPermission(permissionName, managed) {
  if (permissionName === 'Administrator') {
    return managed
      ? 'A managed or bot-related role with Administrator can create broad security exposure if the integration is compromised or misconfigured.'
      : 'Administrator grants broad control and bypasses channel-level permission restrictions.';
  }

  return managed
    ? `${permissionName} on a managed or bot-related role can increase risk if the integration is compromised or over-scoped.`
    : `${permissionName} can materially increase moderation, configuration, or visibility risk depending on role assignment.`;
}

function recommendationForPermission(permissionName, managed) {
  if (managed) {
    return `Review the integration or bot that owns this role and confirm ${permissionName} is necessary. Prefer least privilege.`;
  }

  return `Review whether this role truly needs ${permissionName}. Prefer least privilege and document authorized high-risk permissions.`;
}

function overwriteSummary(overwrite) {
  return `allow=${overwrite.allow.bitfield.toString()}; deny=${overwrite.deny.bitfield.toString()}`;
}

function hasPermissionBit(permissions, permissionBit) {
  if (!permissions || permissions.bitfield === undefined) return false;
  return (BigInt(permissions.bitfield) & BigInt(permissionBit)) === BigInt(permissionBit);
}

module.exports = { evaluateCurrentRisk, dangerousPermissions };
