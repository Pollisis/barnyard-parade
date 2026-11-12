// Barnyard Parade: names and tuning knobs. Change GAME_NAME here to rename the game everywhere.
(function (root) {
  const GAME_NAME = 'Barnyard Parade';
  const VERSION = 1;
  const CONFIG = {
    // Core rules
    PATH_CAPACITY: 12,        // animals the dirt path can hold
    SET_SIZE: 8,              // animals of one kind that clear together
    CLEAR_ANYWHERE: false,    // false = only the front of the line is checked (confirmed rule)
    PLUS2_AMOUNT: 2,          // extra path space from the +2 power-up
    PLUS2_MAX_PER_LEVEL: 2,   // how many times +2 can stack in one level

    // Difficulty curve (ramps gently, then plateaus at the *_RAMP_LEVEL values)
    KINDS_START: 3,           // animal kinds on level 1
    KINDS_MAX: 8,             // plateau (10 exist)
    KINDS_EVERY: 4,           // +1 kind every N levels
    SETS_MAX_START: 1,        // max sets (of 8) per kind on level 1
    SETS_MAX_END: 2,          // max sets per kind at plateau
    SETS_RAMP_LEVEL: 24,
    HIDDEN_FROM_LEVEL: 3,     // first level with "?" tiles
    HIDDEN_START: 0.2,        // share of inner pairs hidden when they first appear
    HIDDEN_MAX: 0.6,          // plateau share of inner pairs hidden
    HIDDEN_RAMP_LEVEL: 30,
    GLASS_FROM_LEVEL: 6,      // first level that can have glass crates
    GLASS_EVERY: 10,          // +1 possible glass crate every N levels after that
    GLASS_MAX: 2,
    GLASS_COUNTS: [4, 6],     // animals a glass crate asks for (even numbers)
    GLASS_CONTENT: [2, 4],    // pairs sealed under a glass crate (min, max)
    MIX_START: 0.1,           // how much the hidden "intended" order interleaves kinds
    MIX_MAX: 0.55,
    MIX_RAMP_LEVEL: 30,
    CRATE_LEN_START: 3,       // max pairs per crate early on
    CRATE_LEN_MAX: 4,         // max pairs per crate at plateau
    CRATE_LEN_RAMP_LEVEL: 12,

    // Fairness checks run on every level before it is shown
    SOLVER_NODE_LIMIT: 80000, // full-information solver must find a win without power-ups
    BOT_RUNS: 10,             // a "blind" bot that only sees what you see plays this many times
    BOT_MIN_WINRATE_START: 0.6,
    BOT_MIN_WINRATE_END: 0.2,
    BOT_RAMP_LEVEL: 30,
    GEN_MAX_TRIES: 80,

    // Power-ups: free, earned by playing, banked across levels
    START_BANK: { undo: 2, swap: 1, plus2: 1, magnet: 1 },
    REWARD_ROTATION: ['undo', 'swap', 'plus2', 'magnet'], // +1 of the next one each first-time clear
    BUNDLE_EVERY: 5,          // every Nth level also gives +1 of each
    BANK_MAX: 99,

    MAP_LEVELS_AHEAD: 12,     // locked levels shown ahead on the map
  };
  const api = { GAME_NAME, VERSION, CONFIG };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BP_CONFIG = api;
})(this);
