// Balancing-only knobs for a two-day gameplay experiment. Not final design decisions.
// Floors 1-3 have no exits. Floors 4-7 use per-run navigation budgets, not these baseline times alone.
export const SETTINGS = Object.freeze({
  exitCloseSeconds: [null, null, null, 480, 660, 840, 1020, null],
  finalExitCloseSeconds: null,
  threatStepSeconds: 150,
  enemySpawnIntervals: [10,7.5,6,4.6666666667],
  enemySpawnBatch: [1,2,3,4],
  enemyCaps: [7,12,19,26],
  enemyHealth: 34,
  playerHealth: 100,
  playerMoveSpeed: 5.2,
  maxSquadSize: 4,
  xpMilestones: [14,34,64,104,154,220,300,400],
  lootSeconds: {crate:1.5,recruit:2.1,key:2.6},
  cameraDistance: 7,
  bagWidth: 8,
  bagHeight: 6
});
