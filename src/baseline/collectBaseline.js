const { safeName } = require('../utils/safeNames');
const { nowIso } = require('../utils/time');

async function collectBaseline(guild) {
  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id)
    .map((role) => ({
      id: role.id,
      name: safeName(role.name),
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      managed: role.managed,
      mentionable: role.mentionable
    }))
    .sort((a, b) => b.position - a.position);

  const channels = guild.channels.cache
    .map((channel) => ({
      id: channel.id,
      name: safeName(channel.name),
      type: channel.type,
      parentId: channel.parentId || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    schemaVersion: 1,
    guild: {
      id: guild.id,
      name: safeName(guild.name)
    },
    roles,
    channels,
    collectedAt: nowIso()
  };
}

module.exports = { collectBaseline };
