const { safeName } = require('../utils/safeNames');
const { nowIso } = require('../utils/time');

function permissionBitfield(permissions) {
  if (!permissions || permissions.bitfield === undefined) return '0';
  return permissions.bitfield.toString();
}

function collectPermissionOverwrites(channel) {
  if (!channel.permissionOverwrites || !channel.permissionOverwrites.cache) {
    return [];
  }

  return channel.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString()
  }));
}

function collectVisibleBotMembers(guild, skippedChecks) {
  if (!guild.members || !guild.members.cache) {
    skippedChecks.push({
      checkName: 'bot_members',
      reason: 'Guild member cache is not available without requesting privileged member data.',
      missingPermission: null
    });
    return [];
  }

  const botMembers = guild.members.cache
    .filter((member) => member.user && member.user.bot)
    .map((member) => ({
      id: member.id,
      displayName: safeName(member.displayName),
      username: safeName(member.user.username),
      managed: Boolean(member.roles && member.roles.botRole)
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  skippedChecks.push({
    checkName: 'bot_members',
    reason: 'Only bot/application members already visible in cache were included. Driftwatch does not fetch all guild members or require Guild Members Intent.',
    missingPermission: null
  });

  return botMembers;
}

async function collectBaseline(guild) {
  const skippedChecks = [];
  const collectedAt = nowIso();
  const everyoneRole = guild.roles.everyone;

  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id)
    .map((role) => ({
      id: role.id,
      name: safeName(role.name),
      position: role.position,
      permissions: permissionBitfield(role.permissions),
      managed: role.managed,
      mentionable: role.mentionable,
      hoist: role.hoist,
      color: role.hexColor || null
    }))
    .sort((a, b) => b.position - a.position);

  const channels = guild.channels.cache
    .map((channel) => ({
      id: channel.id,
      name: safeName(channel.name),
      type: channel.type,
      parentId: channel.parentId || null,
      permissionOverwrites: collectPermissionOverwrites(channel)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    schemaVersion: 1,
    guild: {
      id: guild.id,
      name: safeName(guild.name)
    },
    createdAt: collectedAt,
    everyonePermissions: {
      roleId: everyoneRole.id,
      permissions: permissionBitfield(everyoneRole.permissions)
    },
    roles,
    channels,
    botMembersVisibleFromCache: collectVisibleBotMembers(guild, skippedChecks),
    skippedChecks,
    collectedAt
  };
}

module.exports = { collectBaseline };
