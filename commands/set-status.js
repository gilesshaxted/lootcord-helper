const { SlashCommandBuilder } = require('discord.js');
const { doc, getDoc } = require('firebase/firestore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot-stats')
    .setDescription('Forces the bot to update its status from Firestore presence info.'),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('firebase/firestore').Firestore} db
   * @param {import('discord.js').Client} client
   * @param {string} APP_ID_FOR_FIRESTORE
   */
  async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
    await interaction.deferReply({ ephemeral: true });

    if (!db || !APP_ID_FOR_FIRESTORE) {
      return await interaction.editReply({
        content: 'Bot is not fully initialized (Firestore unavailable).',
      });
    }

    const presenceRef = doc(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botStatus`, 'mainStatus');

    try {
      const docSnap = await getDoc(presenceRef);

      if (!docSnap.exists()) {
        return await interaction.editReply({
          content: 'No presence data found in Firestore.',
        });
      }

      const data = docSnap.data();
      const statusText = data.status || 'Helping adventurers!';

      // Update bot presence
      if (client.user) {
        client.user.setPresence({
          activities: [{
            name: statusText,
            type: 0, // Playing by default
          }],
          status: 'online',
        });

        await interaction.editReply({
          content: `Bot presence manually updated to: \`${statusText}\``,
        });

        console.log(`Bot presence manually set via /bot-stats: "${statusText}"`);
      } else {
        await interaction.editReply({
          content: 'Error: Bot client user not available to set presence.',
        });
      }

    } catch (error) {
      console.error('Error fetching bot status from Firestore:', error);
      await interaction.editReply({
        content: 'Failed to fetch or apply presence update. Check console for errors.',
      });
    }
  },
};
