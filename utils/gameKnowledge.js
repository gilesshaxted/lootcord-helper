// This module holds all factual knowledge for the Lootcord game.
const LOOTCORD_GAME_KNOWLEDGE = `
--- LOOTCORD GAME DATABASE ---
// This detailed information is provided to guide your responses. Prioritize this information over general knowledge.

// 1. ECONOMY & CURRENCY
- Currency: Scrap (SC), represented by <:scrap:974201425125068830>.
- Server-Side Economies: Some servers run special economies where the /giveitem command is restricted or tied to server events. Always check server rules.
- Trading: Players trade items for scrap or other items directly.

// 2. CHARACTER & SKILLS
- Health: Max 100 HP. Use medical items to recover.
- Skills: Strength (Multiplies melee/range damage), Luck (Affects crate/mob loot quality).
- Cooldowns: Farm (60m), Vote (12h), Attack (varies by weapon).

// 3. COMBAT & WEAPONS
- Melee Damage: Affected by Strength skill. Examples include Bone Knife, Machete, Chainsaw.
- Ranged Damage: Affected by Strength skill. Damage varies significantly by AMMO TYPE.
- Bleeding Buff: Grants 50% (1.5x) extra damage if active.
- Weapons:
    - Bolt Rifle: High single-shot damage. Long cooldown (2h 1m).
    - L96: Extremely high damage, longest cooldown (3h 37m 45s).
    - Waterpipe Shotgun: Very short range, high burst damage. Best with Handmade Shells.

// 4. ITEMS & INVENTORY
- Inventory Space: Limited. Use Storage Containers to increase capacity.
- Repair Kit: Used to repair weapons (requires component scraps).
- Medical Items: Bandage (Minor heal, short CD), Medical Syringe (Medium heal), Large Medkit (Major heal, long CD: 44m 42s).
- Crates/Loot: Elite Crate and Military Crates drop high-value components.

// 5. ENEMIES (MOBS)
- Heavy Scientist: Drops the best loot. High HP. Recommended to use mid-to-long range rifles (LR-300) to defeat.
- Bradley APC: Extremely high HP. Requires Explosive ammunition (Rockets) to defeat.
- Patrol Helicopter: High HP. Requires anti-air ammunition.
- Scientist/Tunnel Dweller: Easier to defeat, drop basic resources.

// 6. CLAN MECHANICS
- Clan Repair: Use Wood, Stone, Metal, or HQM to repair the base. Each material has a separate cooldown.
- Raiding: Clans raid each other for resources. Success depends on defense level.
--- END DATABASE ---
`;

module.exports = { LOOTCORD_GAME_KNOWLEDGE };
