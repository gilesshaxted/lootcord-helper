const WEAPON_DATA = {
    "Bow": {
        "Bone Arrow": "15 - 22",
        "Arrow": "12 - 19",
        "Fire Arrow": "18 - 25",
    },
    "Crossbow": {
        "Bone Arrow": "21 - 36",
        "Arrow": "18 - 33",
        "Fire Arrow": "24 - 39",
    },
    "F1 Grenade": {
        "Basic Ammo": "13 - 20 (x2)",
    },
    "Flame Thrower": {
        "Basic Ammo": "11 - 21",
    },
    "Snowball Gun": {
        "Basic Ammo": "60 - 77",
    },
    "Waterpipe Shotgun": {
        "Handmade Shell": "5 - 33",
        "12g Buckshot": "15 - 43",
        "12g Slug": "33 - 61",
        "Incen": "21 - 49",
    },
    "Pump Shotgun": {
        "Handmade Shell": "20 - 32",
        "12g Buckshot": "30 - 42",
        "12g Slug": "48 - 60",
        "Incen": "36 - 50",
    },
    "Spas-12": {
        "Handmade Shell": "35 - 51",
        "12g Buckshot": "45 - 61",
        "12g Slug": "63 - 79",
        "Incen": "51 - 67",
    },
    "M4": {
        "Handmade Shell": "40 - 59",
        "12g Buckshot": "51 - 71",
        "12g Slug": "68 - 85",
        "Incen": "60 - 72",
    },
    "M92": {
        "Pistol Bullet": "28 - 35",
        "High Velocity": "28 - 35",
        "Incen": "32 - 39",
    },
    "Semi Pistol": {
        "Pistol Bullet": "20 - 30",
        "High Velocity": "26 - 36",
        "Incen": "24 - 34",
    },
    "Revolver": {
        "Pistol Bullet": "15 - 19",
        "High Velocity": "21 - 25",
        "Incen": "19 - 23",
    },
    "Python": {
        "Pistol Bullet": "40 - 48",
        "High Velocity": "46 - 54",
        "Incen": "44 - 52",
    },
    "MP5": {
        "Pistol Bullet": "36 - 45",
        "High Velocity": "42 - 51",
        "Incen": "40 - 49",
    },
    "Thompson": {
        "Pistol Bullet": "32 - 43",
        "High Velocity": "38 - 49",
        "Incen": "36 - 47",
    },
    "Custom SMG": {
        "Pistol Bullet": "26 - 36",
        "High Velocity": "32 - 42",
        "Incen": "30 - 40",
    },
    "Semi Rifle": {
        "Rifle Bullet": "30 - 42",
        "High Velocity": "30 - 42",
        "Incen": "29 - 41",
        "Explo": "21 - 33 (x2)",
    },
    "M39 Rifle": {
        "Rifle Bullet": "63 - 68",
        "High Velocity": "63 - 68",
        "Incen": "62 - 67",
        "Explo": "45 - 63 (x2)",
    },
    "LR-300": {
        "Rifle Bullet": "55 - 63",
        "High Velocity": "55 - 63",
        "Incen": "54 - 62",
        "Explo": "40 - 55 (x2)",
    },
    "M249": {
        "Rifle Bullet": "72 - 97",
        "High Velocity": "72 - 97",
        "Incen": "71 - 96",
        "Explo": "43 - 55",
    }, // <-- Fix applied here: Removed extra '}' and ensured this has a comma.
    "hmlmg": { // <-- New entry (lowercase)
        "Rifle Bullet": "63 - 82", // <-- Removed leading space for consistency
        "High Velocity": "60 - 71",
        "Incen": "62 - 72",
        "Explo": "43 - 55 (x2)",
    },
    "Bolt Rifle": {
        "Rifle Bullet": "79 - 84",
        "High Velocity": "79 - 84",
        "Incen": "78 - 83",
        "Explo": "50 - 54 (x2)",
    },
    "sks": { // <-- New entry (lowercase)
        "Rifle Bullet": "48 - 56", // <-- Removed leading space for consistency
        "High Velocity": "46 - 55",
        "Incen": "48 - 58", // <-- Assumed typo fix from 548 to 48
        "Explo": "38 - 58 (x2)",
    },
    "Assault Rifle": {
        "Rifle Bullet": "59 - 70",
        "High Velocity": "59 - 70",
        "Incen": "58 - 69",
        "Explo": "42 - 58 (x2)",
    },
    "L96": {
        "Rifle Bullet": "119 - 122",
        "High Velocity": "119 - 122",
        "Incen": "118 - 121",
        "Explo": "55 - 72 (x2)",
    },
    "Grenade launcher": {
        "40mm smoke grenade": "5 - 10",
        "40mm he grenade": "35 - 71 (x3)",
    },
    "Rocket Launcher": {
        "Rocket": "40 - 60 (x3)",
        "HV Rocket": "50 - 65 (x2)",
    }
};

module.exports = { WEAPON_DATA };
