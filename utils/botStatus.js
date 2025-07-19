// utils/botStatus.js

const { doc, onSnapshot } = require('firebase/firestore');

/**
 * Updates the bot's presence on Discord.
 */
function updateBotPresence(client, stats) {
  const presenceOptions = {
    activities: [{
      name: `Helping ${stats.totalHelps || 0} times!`,
      type: 3
    }],
    status: 'online'
  };
  client.user.setPresence(presenceOptions);
}

/**
 * Starts a Firestore listener to monitor presence status changes.
 */
function startBotPresenceListener(client, db) {
  if (!client || !db) {
    console.warn("startBotPresenceListener: Missing client or db.");
    return;
  }

  const presenceRef = doc(db, 'artifacts/my-discord-bot-app/public/data/botStatus/mainStatus');

  onSnapshot(presenceRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('Presence listener triggered:', data);
      if (data.status) {
        client.user.setPresence({
          activities: [{
            name: data.status,
            type: 0
          }],
          status: 'online'
        });
      }
    } else {
      console.log('Presence document does not exist.');
    }
  }, (error) => {
    console.error('Error listening to presence document:', error);
  });
}

module.exports = {
  updateBotPresence,
  startBotPresenceListener
};
