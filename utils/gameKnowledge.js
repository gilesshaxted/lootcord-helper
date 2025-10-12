// This module holds all factual knowledge scraped from the Lootcord documentation guides, items, and enemies pages.
// The AI uses this entire string as context to provide accurate, specific, and detailed game answers.

const LOOTCORD_GAME_KNOWLEDGE = `
--- LOOTCORD GAME KNOWLEDGE BASE (VERSION 3.0 - AGGREGATED GUIDES & FAQ) ---

// This database contains comprehensive facts about the game. Use this information to answer user questions accurately.

// I. CORE MECHANICS & CURRENCY
- Primary Currency: Scrap (SC).
- Skills: Strength (affects damage output, e.g., 1.30x damage), Luck (affects loot quality).
- Cooldowns: Farm (60 minutes), Vote (12 hours).
- Status Effects: Includes Bleeding (grants 50% / 1.5x damage buff), Radiation, and Poison.

// II. COMBAT & DAMAGE
- DAMAGE CALCULATION: (Base Damage * Strength Skill Multiplier * Bleeding Multiplier).
- Bleeding Status: Grants 50% (1.5x) extra damage if active.
- Attack Mode: Can be 'Random' (forced via serversettings) or 'Selectable' (allows attacking specific players via 't-use [weapon] @player'). Check status with 'serversettings'.
- Passive Shield: Grants a 24-hour attack shield upon death. It is removed instantly if the player attacks someone.

// III. ENEMIES (MOBS)
- Heavy Scientist: HIGH HP, drops ELITE LOOT (HQM, components). Recommended to use mid-to-long range rifles (LR-300, M249).
- Bradley APC: EXTREME HP. Must be engaged with EXPLOSIVE AMMUNITION (Rockets, 40mm HE Grenades).
- Mob Spawns: Mobs trigger channel renames (e.g., to '🐻╏heavy' or '🚨╏brad') in designated channels.

// IV. CLANS & BASE REPAIR
- Clan Repair Cooldowns: Material-specific cooldowns.
    - Wood: 2 minutes (shortest CD)
    - Stone: 10 minutes
    - Metal: 25 minutes
    - High Quality Metal: 60 minutes (longest CD)
- Raiding: Clans can raid each other using powerful explosives.

// V. DEATH AND PLAYER STATUS
- Death Consequence: If killed by another player, you lose 75% of your scrap and 2 or more items (depending on inventory size).
- Inactive Player: A player inactive for more than 2 weeks is automatically deactivated from all servers to keep the attack pool active.

// VI. PLAYER COMMANDS & MECHANICS (FAQ)
- Main Command List: View all commands with 't-help'.
- Profile/Stats: Use 'profile'.
- Inventory Check: Use 'inv' to view items, health, money, and equipped storage container. Can check other players' inventories.
- Item Usage: Use 'use' (e.g., 't-use bandage' or 't-use crate'). Opening crates uses the 'use' command: 't-use crate'.
- Item Info: Use 'items' to view the full list. Specify an item for details.
- Buying/Selling: Use 'buy [item]' or 'sell [item]'. Specify an amount to purchase/sell.
- Experience/Level Up: Gain XP by opening boxes, crafting, or killing. Check progress with 'xp'. Leveling up rewards a crate and unlocks new recipes.
- Leaderboards: View server or global rankings with 'leaderboard'.
- Settings: Use 'mysettings' to view/change notification settings.
- Prefix Change: Change the bot's prefix using 'setprefix' (requires Manage Server permission). Example: 't-setprefix .'
- Black Market: List and search items for sale by other players using the 'blackmarket' command.
--- END KNOWLEDGE BASE ---
`;

module.exports = { LOOTCORD_GAME_KNOWLEDGE };
