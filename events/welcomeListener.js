const { Events } = require('discord.js');

// --- Configuration ---
const WELCOME_CHANNEL_ID = '1311341302570549401'; // Main chat channel
const VERIFICATION_CHANNEL_ID = '1192414247909589043'; // Verification channel ID

module.exports = {
    name: Events.GuildMemberAdd, // The event to listen for
    once: false,
    async execute(member) {
        // Find the designated welcome channel
        const welcomeChannel = member.client.channels.cache.get(WELCOME_CHANNEL_ID);

        if (!welcomeChannel) {
            console.error(`[Welcome Listener] Welcome channel ID ${WELCOME_CHANNEL_ID} not found.`);
            return;
        }

        // Use the member's mention to welcome them personally
        const welcomeMessage = `
👋 **Welcome, ${member.user.toString()}, to ${member.guild.name}!**

We're glad to have you here! Here’s what you need to know to jump into the action:

### 🚀 **First Steps**
If you haven't already, please head to **<#${VERIFICATION_CHANNEL_ID}>** to verify your account and unlock access to all the chat channels!

### 🤖 **Lootcord Helper Commands**
This bot is packed with features to help you farm efficiently! Here are a few key commands:
* Use **/notify** to sign up for cooldown notifications. Never miss a drop!
* Use **/solo** and **/solo-off** to claim a mob for yourself. (Note: Mob owners still retain kill priority.)
* Use **/damage-calc** to help work out your own personalized attack damage.

### 🌟 **Automated Features**
Lootcord Helper also handles a lot automatically in the background:
* **Automatic Channel Naming** for mobs in dedicated channels.
* **Automatic Trivia & Scramble Answers** to help the server stay engaged.
* **Specific Shop Pings** for desirable items when they appear.
* You can also ask this bot questions about the game right here in this chat!

Check out **<id:customize>** for all available ping roles (e.g., for specific bosses or items)! Good luck, and happy looting!
        `;

        try {
            await welcomeChannel.send({ content: welcomeMessage });
            console.log(`[Welcome Listener] Sent welcome message to ${member.user.tag} in #${welcomeChannel.name}.`);
        } catch (error) {
            console.error(`[Welcome Listener] Failed to send message to #${welcomeChannel.name}:`, error);
        }
    },
};
