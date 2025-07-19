let db; // 👈 declare at the top so it’s accessible globally

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log('------');

  if (client.guilds.cache.size > 0) {
    const firstGuild = client.guilds.cache.first();
    console.log(`Bot is in guild: ${firstGuild.name} (ID: ${firstGuild.id})`);
  } else {
    console.log('Bot is not in any guilds yet.');
  }

  // ✅ Initialize Firebase and Firestore
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  try {
    const userCredential = await signInAnonymously(auth);
    console.log('Signed in to Firebase anonymously.');
    db = getFirestore(app);
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    process.exit(1);
  }

  // ✅ Firestore listeners and slash commands
  await setupFirestoreListeners();

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log(`Started refreshing ${slashCommandsToRegister.length} application (/) commands.`);
    const data = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: slashCommandsToRegister }
    );
    console.log(`Successfully reloaded ${data.length} global (/) commands.`);
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }

  // ✅ Initial presence
  botStatus.updateBotPresence(client, statsTracker.getBotStats());
  setInterval(() => botStatus.updateBotPresence(client, statsTracker.getBotStats()), 300000);

  // ✅ Now that db is ready, start bot presence listener
  startBotPresenceListener(client, db);

  // ✅ Startup housekeeping
  await startupChecks.checkAndRenameChannelsOnStartup(db, true, client); // Assume isFirestoreReady = true
});
