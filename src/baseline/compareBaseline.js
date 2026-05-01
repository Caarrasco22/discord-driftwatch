const { PermissionFlagsBits } = require('discord.js');
const { createFinding } = require('../models/finding');
const { Severity } = require('../models/severity');
const { Categories } = require('../models/categories');

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
const mediumRiskPermissions = new Set(['BanMembers', 'KickMembers', 'MentionEveryone']);

function compareBaseline(previousSnapshot = {}, currentSnapshot = {}) {
  const findings = [];
  const skippedChecks = [...(currentSnapshot.skippedChecks || [])];

  if (Array.isArray(previousSnapshot.roles) && Array.isArray(currentSnapshot.roles)) {
    compareRoles(previousSnapshot, currentSnapshot, findings);
  } else {
    skippedChecks.push({
      checkName: 'roles_compare',
      reason: 'Role comparison skipped because role data was missing from one snapshot.',
      missingPermission: null
    });
  }

  if (Array.isArray(previousSnapshot.channels) && Array.isArray(currentSnapshot.channels)) {
    compareChannels(previousSnapshot, currentSnapshot, findings);
  } else {
    skippedChecks.push({
      checkName: 'channels_compare',
      reason: 'Channel comparison skipped because channel data was missing from one snapshot.',
      missingPermission: null
    });
  }

  if (previousSnapshot.everyonePermissions && currentSnapshot.everyonePermissions) {
    compareEveryone(previousSnapshot, currentSnapshot, findings);
  } else {
    skippedChecks.push({
      checkName: 'everyone_permissions_compare',
      reason: '@everyone permission comparison skipped because one snapshot does not include @everyone permissions.',
      missingPermission: null
    });
  }

  if (Array.isArray(previousSnapshot.botMembersVisibleFromCache) && Array.isArray(currentSnapshot.botMembersVisibleFromCache)) {
    compareVisibleBots(previousSnapshot, currentSnapshot, findings, skippedChecks);
  } else {
    skippedChecks.push({
      checkName: 'visible_bot_members_compare',
      reason: 'Visible bot/application member comparison skipped because one snapshot does not include cache-limited bot member data.',
      missingPermission: null
    });
  }

  return {
    findings,
    skippedChecks,
    summary: 'v0.1 heuristic baseline comparison completed. Results are based on sanitized cached guild configuration and may be limited by available cache data.'
  };
}

function compareRoles(previousSnapshot, currentSnapshot, findings) {
  const previousRoles = mapById(previousSnapshot.roles);
  const currentRoles = mapById(currentSnapshot.roles);

  for (const role of currentRoles.values()) {
    const previous = previousRoles.get(role.id);
    if (!previous) {
      findings.push(createFinding({
        ruleId: 'baseline.role.added',
        severity: Severity.LOW,
        category: Categories.BASELINE,
        title: 'Role added since baseline',
        assetType: 'role',
        assetId: role.id,
        assetName: role.name,
        previousValue: null,
        currentValue: roleSummary(role),
        impact: 'A new role can change the server permission model if assigned or configured later.',
        likelihood: 'low',
        evidence: [`Role ${role.name} exists in the current snapshot but not in the baseline.`],
        recommendation: 'Review the role purpose, assigned permissions, and whether it should exist.',
        confidence: 0.95
      }));
      continue;
    }

    if (Number(role.position) > Number(previous.position)) {
      findings.push(createFinding({
        ruleId: 'baseline.role.position.up',
        severity: Severity.MEDIUM,
        category: Categories.DRIFT,
        title: 'Role moved upward in hierarchy',
        assetType: 'role',
        assetId: role.id,
        assetName: role.name,
        previousValue: String(previous.position),
        currentValue: String(role.position),
        impact: 'Higher role position can increase moderation or role-management impact depending on permissions.',
        likelihood: 'medium',
        evidence: [`Position changed from ${previous.position} to ${role.position}.`],
        recommendation: 'Confirm this hierarchy change was intentional and authorized.',
        confidence: 0.9
      }));
    } else if (Number(role.position) !== Number(previous.position)) {
      findings.push(createFinding({
        ruleId: 'baseline.role.position.changed',
        severity: Severity.INFO,
        category: Categories.DRIFT,
        title: 'Role position changed',
        assetType: 'role',
        assetId: role.id,
        assetName: role.name,
        previousValue: String(previous.position),
        currentValue: String(role.position),
        impact: 'Role hierarchy changed since the baseline.',
        likelihood: 'low',
        evidence: [`Position changed from ${previous.position} to ${role.position}.`],
        recommendation: 'Review whether the role hierarchy still matches the intended security model.',
        confidence: 0.9
      }));
    }

    if (String(role.permissions) !== String(previous.permissions)) {
      findings.push(createFinding({
        ruleId: 'baseline.role.permissions.changed',
        severity: Severity.INFO,
        category: Categories.PERMISSIONS,
        title: 'Role permissions changed',
        assetType: 'role',
        assetId: role.id,
        assetName: role.name,
        previousValue: String(previous.permissions),
        currentValue: String(role.permissions),
        impact: 'Role permissions changed since the baseline.',
        likelihood: 'medium',
        evidence: [`Permissions changed from ${previous.permissions} to ${role.permissions}.`],
        recommendation: 'Review the exact permission diff and confirm the change was expected.',
        confidence: 0.9
      }));
    }

    compareDangerousPermissions({
      previousPermissions: previous.permissions,
      currentPermissions: role.permissions,
      assetType: 'role',
      assetId: role.id,
      assetName: role.name,
      managed: role.managed,
      findings
    });
  }

  for (const role of previousRoles.values()) {
    if (currentRoles.has(role.id)) continue;
    findings.push(createFinding({
      ruleId: 'baseline.role.removed',
      severity: Severity.LOW,
      category: Categories.BASELINE,
      title: 'Role removed since baseline',
      assetType: 'role',
      assetId: role.id,
      assetName: role.name,
      previousValue: roleSummary(role),
      currentValue: null,
      impact: 'A removed role can affect access control, moderation flows, or bot integrations.',
      likelihood: 'low',
      evidence: [`Role ${role.name} existed in the baseline but not in the current snapshot.`],
      recommendation: 'Confirm the role removal was intentional.',
      confidence: 0.95
    }));
  }
}

function compareChannels(previousSnapshot, currentSnapshot, findings) {
  const previousChannels = mapById(previousSnapshot.channels);
  const currentChannels = mapById(currentSnapshot.channels);

  for (const channel of currentChannels.values()) {
    const previous = previousChannels.get(channel.id);
    if (!previous) {
      findings.push(createFinding({
        ruleId: 'baseline.channel.added',
        severity: Severity.LOW,
        category: Categories.CHANNELS,
        title: 'Channel added since baseline',
        assetType: 'channel',
        assetId: channel.id,
        assetName: channel.name,
        previousValue: null,
        currentValue: channelSummary(channel),
        impact: 'A new channel can expose information if permissions are broader than intended.',
        likelihood: 'low',
        evidence: [`Channel ${channel.name} exists in the current snapshot but not in the baseline.`],
        recommendation: 'Review channel permissions and category placement.',
        confidence: 0.95
      }));
      continue;
    }

    if ((channel.parentId || null) !== (previous.parentId || null)) {
      findings.push(createFinding({
        ruleId: 'baseline.channel.parent.changed',
        severity: Severity.LOW,
        category: Categories.CHANNELS,
        title: 'Channel parent changed',
        assetType: 'channel',
        assetId: channel.id,
        assetName: channel.name,
        previousValue: previous.parentId || 'none',
        currentValue: channel.parentId || 'none',
        impact: 'Moving a channel can change inherited organization and may indicate a permission review is needed.',
        likelihood: 'low',
        evidence: [`Parent changed from ${previous.parentId || 'none'} to ${channel.parentId || 'none'}.`],
        recommendation: 'Confirm the channel still belongs in the intended category.',
        confidence: 0.9
      }));
    }

    const previousOverwrites = stableJson(previous.permissionOverwrites || []);
    const currentOverwrites = stableJson(channel.permissionOverwrites || []);
    if (previousOverwrites !== currentOverwrites) {
      const sensitiveVisibilityChanged = broadlyVisibleStaffChannel(previous, channel, currentSnapshot.guild && currentSnapshot.guild.id);
      findings.push(createFinding({
        ruleId: 'baseline.channel.overwrites.changed',
        severity: sensitiveVisibilityChanged ? Severity.CRITICAL : Severity.MEDIUM,
        category: Categories.PERMISSIONS,
        title: sensitiveVisibilityChanged
          ? 'Sensitive channel may have become broadly visible'
          : 'Channel permission overwrites changed',
        assetType: 'channel',
        assetId: channel.id,
        assetName: channel.name,
        previousValue: previousOverwrites,
        currentValue: currentOverwrites,
        impact: sensitiveVisibilityChanged
          ? 'A sensitive channel may now be visible to @everyone based on permission overwrites.'
          : 'Channel-specific permissions changed since the baseline.',
        likelihood: 'medium',
        evidence: ['Permission overwrites differ between the baseline and current snapshot.'],
        recommendation: 'Review channel overwrites and confirm visibility is intentional.',
        confidence: sensitiveVisibilityChanged ? 0.7 : 0.85
      }));
    }
  }

  for (const channel of previousChannels.values()) {
    if (currentChannels.has(channel.id)) continue;
    findings.push(createFinding({
      ruleId: 'baseline.channel.removed',
      severity: Severity.LOW,
      category: Categories.CHANNELS,
      title: 'Channel removed since baseline',
      assetType: 'channel',
      assetId: channel.id,
      assetName: channel.name,
      previousValue: channelSummary(channel),
      currentValue: null,
      impact: 'A removed channel can indicate expected cleanup or a change that should be verified.',
      likelihood: 'low',
      evidence: [`Channel ${channel.name} existed in the baseline but not in the current snapshot.`],
      recommendation: 'Confirm the channel removal was intentional.',
      confidence: 0.95
    }));
  }
}

function compareEveryone(previousSnapshot, currentSnapshot, findings) {
  const previousPermissions = previousSnapshot.everyonePermissions && previousSnapshot.everyonePermissions.permissions;
  const currentPermissions = currentSnapshot.everyonePermissions && currentSnapshot.everyonePermissions.permissions;
  if (previousPermissions === undefined || currentPermissions === undefined) return;

  if (String(previousPermissions) !== String(currentPermissions)) {
    findings.push(createFinding({
      ruleId: 'baseline.everyone.permissions.changed',
      severity: Severity.MEDIUM,
      category: Categories.PERMISSIONS,
      title: '@everyone permissions changed',
      assetType: 'role',
      assetId: currentSnapshot.everyonePermissions.roleId || currentSnapshot.guild.id,
      assetName: '@everyone',
      previousValue: String(previousPermissions),
      currentValue: String(currentPermissions),
      impact: '@everyone permission changes affect the broadest role in the server.',
      likelihood: 'medium',
      evidence: [`@everyone permissions changed from ${previousPermissions} to ${currentPermissions}.`],
      recommendation: 'Review @everyone permissions carefully and confirm the change was intended.',
      confidence: 0.9
    }));
  }

  compareDangerousPermissions({
    previousPermissions,
    currentPermissions,
    assetType: 'role',
    assetId: currentSnapshot.everyonePermissions.roleId || currentSnapshot.guild.id,
    assetName: '@everyone',
    everyone: true,
    findings
  });
}

function compareVisibleBots(previousSnapshot, currentSnapshot, findings, skippedChecks) {
  const previousBots = mapById(previousSnapshot.botMembersVisibleFromCache);
  const currentBots = mapById(currentSnapshot.botMembersVisibleFromCache);

  if (previousBots.size === 0 && currentBots.size === 0) {
    skippedChecks.push({
      checkName: 'visible_bot_members_compare',
      reason: 'No bot/application member cache was available to compare. Driftwatch did not fetch all members or use privileged member intent.',
      missingPermission: null
    });
    return;
  }

  for (const bot of currentBots.values()) {
    if (previousBots.has(bot.id)) continue;
    findings.push(createFinding({
      ruleId: 'baseline.bot.visible.added',
      severity: Severity.LOW,
      category: Categories.BOTS,
      title: 'Visible bot/application member added since baseline',
      assetType: 'bot',
      assetId: bot.id,
      assetName: bot.displayName || bot.username,
      previousValue: null,
      currentValue: bot.displayName || bot.username,
      impact: 'A newly visible bot or application member may affect server security depending on its roles and permissions.',
      likelihood: 'low',
      evidence: ['The bot/application member is present in current cache but was not present in the baseline cache snapshot.'],
      recommendation: 'Review the bot or application member and its assigned roles.',
      confidence: 0.6
    }));
  }

  for (const bot of previousBots.values()) {
    if (currentBots.has(bot.id)) continue;
    findings.push(createFinding({
      ruleId: 'baseline.bot.visible.removed',
      severity: Severity.LOW,
      category: Categories.BOTS,
      title: 'Visible bot/application member removed since baseline',
      assetType: 'bot',
      assetId: bot.id,
      assetName: bot.displayName || bot.username,
      previousValue: bot.displayName || bot.username,
      currentValue: null,
      impact: 'A removed bot or application member may indicate expected cleanup or an integration change that should be verified.',
      likelihood: 'low',
      evidence: ['The bot/application member was present in baseline cache data but is not present in current cache data.'],
      recommendation: 'Confirm the bot or application removal was intentional.',
      confidence: 0.6
    }));
  }
}

function compareDangerousPermissions({ previousPermissions, currentPermissions, assetType, assetId, assetName, managed, everyone, findings }) {
  const previous = toBigInt(previousPermissions);
  const current = toBigInt(currentPermissions);

  for (const [permissionName, permissionBit] of dangerousPermissions) {
    const bit = BigInt(permissionBit);
    const had = (previous & bit) === bit;
    const has = (current & bit) === bit;
    if (had === has) continue;

    const gained = has && !had;
    findings.push(createFinding({
      ruleId: gained ? 'baseline.permission.dangerous.gained' : 'baseline.permission.dangerous.lost',
      severity: permissionSeverity(permissionName, gained, { managed, everyone }),
      category: Categories.PERMISSIONS,
      title: `${assetName} ${gained ? 'gained' : 'lost'} ${permissionName}`,
      assetType,
      assetId,
      assetName,
      previousValue: String(previousPermissions),
      currentValue: String(currentPermissions),
      impact: gained
        ? `${permissionName} can materially increase server security risk depending on role assignment and hierarchy.`
        : `${permissionName} was removed, which may reduce risk or reflect an intended permission cleanup.`,
      likelihood: gained ? 'medium' : 'low',
      evidence: [`Dangerous permission ${permissionName} was ${gained ? 'added' : 'removed'} between baseline and current snapshot.`],
      recommendation: gained
        ? 'Confirm this permission grant was authorized and still matches the intended security model.'
        : 'Confirm this permission removal was intentional and does not break required administration workflows.',
      confidence: 0.9
    }));
  }
}

function permissionSeverity(permissionName, gained, { managed, everyone }) {
  if (!gained) return Severity.INFO;
  if (permissionName === 'Administrator') return Severity.CRITICAL;
  if (everyone) return Severity.CRITICAL;
  if (managed && highRiskPermissions.has(permissionName)) return Severity.HIGH;
  if (highRiskPermissions.has(permissionName)) return Severity.HIGH;
  if (mediumRiskPermissions.has(permissionName)) return Severity.MEDIUM;
  return Severity.MEDIUM;
}

function broadlyVisibleStaffChannel(previous, current, guildId) {
  if (!looksSensitive(current.name)) return false;
  const previousEveryone = findEveryoneOverwrite(previous, guildId);
  const currentEveryone = findEveryoneOverwrite(current, guildId);
  if (!currentEveryone) return false;

  const viewBit = BigInt(PermissionFlagsBits.ViewChannel);
  const currentAllowsView = (toBigInt(currentEveryone.allow) & viewBit) === viewBit;
  const previousAllowedView = previousEveryone && (toBigInt(previousEveryone.allow) & viewBit) === viewBit;
  const previousDeniedView = previousEveryone && (toBigInt(previousEveryone.deny) & viewBit) === viewBit;

  return currentAllowsView && (!previousAllowedView || previousDeniedView);
}

function findEveryoneOverwrite(channel, guildId) {
  const overwrites = Array.isArray(channel.permissionOverwrites) ? channel.permissionOverwrites : [];
  return overwrites.find((overwrite) => overwrite.id === guildId && overwrite.type === 0) || null;
}

function looksSensitive(name) {
  return /\b(staff|admin|mod|moderator|private|security|logs?)\b/i.test(String(name || ''));
}

function mapById(items) {
  return new Map((Array.isArray(items) ? items : []).filter((item) => item && item.id).map((item) => [item.id, item]));
}

function roleSummary(role) {
  return `position=${role.position}; permissions=${role.permissions}; managed=${Boolean(role.managed)}`;
}

function channelSummary(channel) {
  return `type=${channel.type}; parent=${channel.parentId || 'none'}`;
}

function stableJson(value) {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortForStableJson).sort((a, b) => stableJsonSortKey(a).localeCompare(stableJsonSortKey(b)));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = sortForStableJson(value[key]);
      return result;
    }, {});
  }
  return value;
}

function stableJsonSortKey(value) {
  return JSON.stringify(value);
}

function toBigInt(value) {
  try {
    return BigInt(value || 0);
  } catch (error) {
    return 0n;
  }
}

module.exports = { compareBaseline, dangerousPermissions };
