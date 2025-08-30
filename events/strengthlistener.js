const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot
const STRENGTH_REGEX = /\*\*Strength:\*\* (\d+\.\d+)x damage/i; // Regex to capture the strength value

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (!isFirestoreReady || message.author.id !== TARGET_GAME_BOT_ID || message.embeds.length === 0) {
            return;
        }

        try {
            const messages = await message.channel.messages.fetch({ limit: 2 });
            const previousMessage = messages.last();

            if (previousMessage && !previousMessage.author.bot && previousMessage.content.toLowerCase() === 't-p') {
                const userId = previousMessage.author.id;
                const upgradesField = message.embeds[0].fields.find(field => field.name.includes('Upgrades'));
                
                if (upgradesField) {
                    const strengthMatch = upgradesField.value.match(STRENGTH_REGEX);
                    
                    if (strengthMatch && strengthMatch[1]) {
                        const newStrengthValue = parseFloat(strengthMatch[1]);
                        const userSkillsRef = doc(db, `artifacts/${APP_ID_FOR_FIRESTORE}/users/${userId}/skills`, 'main');
                        const docSnap = await getDoc(userSkillsRef);

                        if (docSnap.exists()) {
                            const oldStrengthValue = docSnap.data().strength;
                            if (newStrengthValue > oldStrengthValue) {
                                await message.channel.send(`📈 Your Strength Skill has increased to **${newStrengthValue}x**`);
                            } else if (newStrengthValue < oldStrengthValue) {
                                await message.channel.send(`📉 Your Strength Skill has decreased to **${newStrengthValue}x**`);
                            }
                        } else {
                            await message.channel.send(`Your strength skill has now been set to **${newStrengthValue}x**`);
                        }
                        
                        await setDoc(userSkillsRef, { strength: newStrengthValue }, { merge: true });
                        return;
                    }
                }
            }
        } catch (error) {
            console.error("[Strength Listener] An unexpected error occurred:", error);
        }
    },
};
