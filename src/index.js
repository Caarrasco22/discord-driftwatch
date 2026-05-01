require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const logger = require('./utils/logger');
const { initDatabase } = require('./db/database');
const driftwatchCommand = require('./commands/driftwatch');

initDatabase();

if (!process.env.DISCORD_TOKEN) {
  logger.error('DISCORD_TOKEN is required to start Driftwatch.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
    // Audit log reads are performed through official REST calls when needed.
    // MessageContent, GuildPresences, and GuildMembers are intentionally not requested.
  ]
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info('Driftwatch ready', { tag: readyClient.user.tag });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'driftwatch') return;

  try {
    await driftwatchCommand.execute(interaction);
  } catch (error) {
    logger.error('Interaction failed', {
      command: interaction.commandName,
      subcommand: interaction.options.getSubcommand(false),
      error: error.stack || error.message
    });

    const response = {
      content: 'Driftwatch hit an internal error while handling this command. No server configuration was changed.',
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
