const { collection, doc, getDoc } = require('firebase/firestore');
const { repostStickyMessage, removeStickyMessage } = require('../utils/stickyMessageManager');

module.exports = {
    name: 'messageCreate', // Listen for all message creations
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from this bot itself to prevent infinite loops
        if (message.author.id === client.user.id) return;

        // Only process messages in guilds
        if (!message.guild) return;

        // Crucial: Check if Firestore is ready
        if (!isFirestoreReady) {
            // console.warn('Solo Sticky Message Listener: Firestore not ready. Skipping message check.'); // Too verbose
            return;
        }

        const channelId = message.channel.id;
        const soloStickyMessagesRef = collection(db, `SoloStickyMessages`);
        const channelStickyDocRef = doc(soloStickyMessagesRef, channelId);

        try {
            const channelStickySnap = await getDoc(channelStickyDocRef);

            if (channelStickySnap.exists()) {
                const stickyData = channelStickySnap.data();
                if (stickyData.isActive && stickyData.stickyMessageId) {
                    // Check if the message being processed is NOT the sticky message itself
                    // and if the sticky message is still valid (not expired)
                    const now = Date.now();
                    if (message.id !== stickyData.stickyMessageId && stickyData.expirationTimestamp > now) {
                        console.log(`Solo Sticky Message Listener: New message detected in solo channel #${message.channel.name}. Reposting sticky.`);
                        await repostStickyMessage(client, db, stickyData);
                    } else if (stickyData.expirationTimestamp <= now) {
                        console.log(`Solo Sticky Message Listener: Sticky message in #${message.channel.name} expired. Removing.`);
                        await removeStickyMessage(db, channelId);
                    }
                }
            }
        } catch (error) {
            console.error(`Solo Sticky Message Listener: Error processing message in #${message.channel.name}:`, error);
        }
    },
};
