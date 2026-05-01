require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const command = new SlashCommandBuilder()
  .setName('driftwatch')
  .setDescription('Authorized defensive Discord security auditing')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('setup')
      .setDescription('Initialize Driftwatch configuration for this server')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('baseline')
      .setDescription('Create, list, or compare defensive configuration baselines')
      .addStringOption((option) =>
        option
          .setName('action')
          .setDescription('Baseline action')
          .setRequired(true)
          .addChoices(
            { name: 'create', value: 'create' },
            { name: 'list', value: 'list' },
            { name: 'compare', value: 'compare' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('check')
      .setDescription('Run a safe placeholder current-risk check')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('logs')
      .setDescription('Run a safe placeholder audit log analysis')
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('Number of days to inspect')
          .setMinValue(1)
          .setMaxValue(45)
      )
      .addIntegerOption((option) =>
        option
          .setName('limit')
          .setDescription('Maximum audit log entries')
          .setMinValue(50)
          .setMaxValue(1000)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('impact')
      .setDescription('Show placeholder impact analysis status')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('report')
      .setDescription('Show the latest placeholder report status')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('data')
      .setDescription('Explain stored Driftwatch data and retention')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('delete-data')
      .setDescription("Delete this guild's local Driftwatch data")
      .addBooleanOption((option) =>
        option
          .setName('confirm')
          .setDescription('Must be true to delete guild-related data')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('help')
      .setDescription('Show Driftwatch command help')
  );

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required to deploy commands. Fill .env before running this script.');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const body = [command.toJSON()];

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`Registered /driftwatch for guild ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log('Registered global /driftwatch command.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  });
}

module.exports = { command, main };
