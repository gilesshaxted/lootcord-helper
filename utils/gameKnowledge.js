// This module holds ALL factual knowledge scraped from the Lootcord documentation (guides, items, and enemies).
// The AI uses this entire string as context to provide accurate, specific, and detailed game answers.

const LOOTCORD_GAME_KNOWLEDGE = `
--- LOOTCORD GAME KNOWLEDGE BASE (VERSION 6.0 - MAX CONTEXT) ---

// This database contains comprehensive facts about the game. Use this information to answer user questions accurately.

// I. CORE MECHANICS & PLAYER STATUS
- Primary Currency: Scrap (SC). The emoji for this is <:scrap:1297320884255588362>.
- Skills: Strength (Multiplies melee/range damage), Luck (Affects loot quality/chances).
- XP/Level Up: Gain XP from opening boxes, crafting, or killing players. Check progress with 't-xp'. Leveling up unlocks new crafting recipes and grants a level-based crate.
- Death Consequence: Lose 75% of scrap and 2 or more items when killed by another player.
- Player Inactivity: A player inactive for > 2 weeks is automatically deactivated from all servers to keep the attack pool active.
- Prefix Change: Change the bot's prefix using 't-setprefix [new prefix]' (requires Manage Server permission).

// II. COMBAT, SHIELDS & STATUS EFFECTS
- DAMAGE CALCULATION: (Base Damage * Strength Skill Multiplier * Bleeding Multiplier).
- Bleeding Status: Grants a 50% (1.5x) extra damage buff if active.
- Passive Shield: Grants a 24-hour attack shield upon death. Removed instantly if the player attacks someone.
- Attack Mode: Servers can be set to 'Random' (forced via t-serversettings) or 'Selectable' (allows targeting players via 't-use [weapon] @player').

// III. INVENTORY & ITEM MANAGEMENT
- Inventory Check: Use 't-inv' (views items, health, money, and equipped storage container).
- Inventory Space: Limited. Use 't-equip storage container' to increase inventory capacity.
- Item Usage: Use 't-use [item]'. 't-use crate' opens boxes.
- Black Market: List and search items for sale by other players using the 't-blackmarket' command.

// IV. CRAFTING & RECYCLING
- Crafting Command: Use 't-craft [item]' to create gear.
- Crafting Skill: Crafting requires a separate Crafting Skill. Higher skill levels unlock better recipes.
- Recycling Command: Use 't-recycle [item]' to dismantle items.
- Recycling Yield: Turns unwanted items back into basic resources (e.g., Metal Fragments, Cloth). Example: Recycling 'Sheet Metal' yields 'Metal Fragments'.

// V. CLAN MECHANICS (DETAILED)
- Clan Purpose: Team up (max 20), safely store loot, and raid others. Clanmates cannot attack each other.
- Clan Creation: Cost is 10,000 scrap. Use 't-clan create [name]'.
- Clan Storage: Deposit/Withdraw using 't-clan deposit/withdraw [item/scrap] [amount]'. 't-clan deposit all' works.
- Daily Upkeep: Automatically paid from scrap bank. Missing upkeep results in a random item loss from storage daily.
- Clan Repair: Use 't-clan repair [material]' to heal base HP. Clans passively gain 5 HP every 2 hours.

// VI. CLAN RANKS & PERMISSIONS
- Recruit (Base Rank): Can only use 't-clan leave'.
- Trusted+ Rank: Can use 't-clan raid', 't-clan deposit', and 't-clan withdraw'. (⚠️ Can rob items).
- Officer+ Rank: Can use 't-clan invite' and 't-clan setstatus'.
- Co-Leader+ Rank: Can 't-clan promote', 't-clan demote', and 't-clan upgrade/repair'.
- Leader (Owner): Can use 't-clan kick'.

// VII. CLAN UPGRADE LEVELS (Levels 1-5, Twig to HQM)
- Lvl 1 (Twig): Storage: 3 items. Scrap Bank: 50,000. Health: 50. Upkeep: 1,000 scrap.
- Lvl 5 (HQM): Cost: 1,000,000 scrap + 4x high_quality_metal. Storage: 40 items. Scrap Bank: 2,000,000. Health: 300. Upkeep: 50,000 scrap.

// VIII. ENEMIES (MOBS) & TARGETING
- Heavy Scientist: Use high-tier rifles (LR-300, M249).
- Bradley APC: Use EXPLOSIVE AMMUNITION (Rockets).
- Mob Spawns: Detected mobs trigger channel renames (e.g., '🐻╏heavy', '🚨╏brad').
- Mob Revert: Channels revert to their original name after the mob is killed or leaves.

--- END KNOWLEDGE BASE ---
`;

module.exports = { LOOTCORD_GAME_KNOWLEDGE };
