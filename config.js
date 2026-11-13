// Barnyard Parade: names and tuning knobs. Change GAME_NAME here to rename the game everywhere.
(function (root) {
  const GAME_NAME = 'Barnyard Parade';
  const VERSION = 3;
  const CONFIG = {
    // Core rules
    TRACK_CAPACITY: 16,       // animals allowed on the loop at once (the "x/16" sign)
    BARN_CAP: 16,             // 8 rows of pairs; a barn clears when it holds 16 of one animal
    TEMP_BARN_CAP: 4,         // the "extra barn" power-up holds 4
    TEMP_BARN_MAX: 2,         // extra barns per level
    PLUS2_AMOUNT: 2,          // +2 power-up (stacks)
    SPEED: 5.25,               // parade speed, cells per second
    ZOOM_SPEED: 3.2,          // speed multiplier when the last animals head home
    GAP: 1.0,                 // spacing between parading animals, in cells

    // Difficulty curve (ramps gently, plateaus at the *_RAMP values)
    KINDS_START: 8,           // animal colors on level 1
    KINDS_MAX: 10,
    KINDS_EVERY: 8,           // +1 color every N levels
    EMPTY_START: 3,           // empty barns at the start of a level (more = easier)
    EMPTY_END: 2,
    EMPTY_DROP_LEVEL: 4,      // level where it drops to EMPTY_END
    MERGE_START: 0.6,         // chance pairs are dealt as longer same-animal runs (higher = easier)
    MERGE_END: 0.35,
    MERGE_RAMP: 30,
    MYSTERY_FROM: 3,          // first level with mystery boxes
    MYSTERY_START: 0.08,      // share of rows that are mystery boxes
    MYSTERY_MAX: 0.3,
    MYSTERY_RAMP: 30,
    PRESET_FROM: 5,           // first level with color-locked barns
    PRESET_START: 2,          // color-locked barns from PRESET_FROM
    PRESET_MORE_FROM: 15,     // level where it goes up to PRESET_MAX
    PRESET_MAX: 3,
    
    // Fairness: every level must be beaten by the rules engine without power-ups before it is shown
    SOLVER_NODE_LIMIT: 2000,
    GEN_MAX_TRIES: 150,

    // Power-ups: free, earned by playing, banked across levels (no store, ads, lives)
    START_BANK: { redo: 3, shuffle: 1, plus2: 1, magnet: 1, barn: 1 },
    REWARD_ROTATION: ['redo', 'plus2', 'barn', 'shuffle', 'redo', 'magnet'],
    BUNDLE_EVERY: 5,          // every Nth level also gives +1 of each
    BANK_MAX: 99,

    MAP_LEVELS_AHEAD: 12,
  };
  const api = { GAME_NAME, VERSION, CONFIG };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BP_CONFIG = api;
})(this);
