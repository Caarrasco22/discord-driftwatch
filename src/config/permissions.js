const { PermissionFlagsBits } = require('discord.js');

const minimumPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ViewAuditLog
];

const optionalPermissions = {
  deeperInviteAnalysis: PermissionFlagsBits.ManageGuild,
  deeperWebhookAnalysis: PermissionFlagsBits.ManageWebhooks,
  privateReportChannel: PermissionFlagsBits.ManageChannels
};

module.exports = { minimumPermissions, optionalPermissions };
