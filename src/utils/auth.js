const { PermissionFlagsBits } = require('discord.js');
const { getDb } = require('../db/database');

function hasPermission(interaction, permission) {
  return Boolean(interaction.memberPermissions && interaction.memberPermissions.has(permission));
}

function hasAuthorizedRole(interaction) {
  const member = interaction.member;
  if (!member || !member.roles || !member.roles.cache) return false;

  const rows = getDb()
    .prepare('SELECT role_id FROM authorized_roles WHERE guild_id = ?')
    .all(interaction.guildId);
  const allowedRoleIds = new Set(rows.map((row) => row.role_id));

  return member.roles.cache.some((role) => allowedRoleIds.has(role.id));
}

async function isAuthorized(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.guild && interaction.user.id === interaction.guild.ownerId) return true;
  if (hasPermission(interaction, PermissionFlagsBits.Administrator)) return true;
  if (hasPermission(interaction, PermissionFlagsBits.ManageGuild)) return true;
  return hasAuthorizedRole(interaction);
}

module.exports = { isAuthorized };
