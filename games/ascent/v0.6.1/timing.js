/** Pure navigation/time budget policy. All deadlines are absolute seconds since
 * the run started; entering a floor never creates a fresh time allowance.
 * Search/combat are deliberate normal-play stops in addition to route walking.
 */
export const BUDGET_SETTINGS = Object.freeze({
  walkingSpeed: 3.0,
  searchPerFloor: 60,
  combatPerFloor: 28,
  firstExitReserve: 90,
  minWindowStep: 180,
  stairsSeconds: 22,
  exitSeconds: 32,
  stairSpeed: 3.0,
  stairHandoffSeconds: 3,
  minExitDistance: 30,
  completionBufferSeconds: 5,
});
const BASELINE_CLOSE = Object.freeze({4: 480, 5: 660, 6: 840, 7: 1020});
const planarPoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const spatialPoint = p => planarPoint(p) && Number.isFinite(p.y);
const distance = (a, b, threeD = false) => Math.hypot(b.x - a.x, b.z - a.z, threeD ? b.y - a.y : 0);

/** Invalid coordinates produce NaN, so they cannot quietly become a zero budget. */
export function pathLength(points, threeD = false) {
  if (!Array.isArray(points) || !points.every(threeD ? spatialPoint : planarPoint)) return NaN;
  return points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p, threeD), 0);
}

/** pathFn(floor, start, end) must return the complete navigable X/Z polyline.
 * stairLinks contain complete physical {x,y,z} paths, ascending fromFloor->toFloor.
 * options override BUDGET_SETTINGS; finalCloseSeconds is an optional 8L minimum
 * deadline, extended when necessary to retain a fair normal-play budget.
 * Open exits have closeAt=null and infinite slack. The 90-second reserve includes
 * the final five-second interaction buffer, after the entire exit trial finishes.
 * Each stair also budgets a separate handoff for approach and squad arrival;
 * this real traversal overhead is never deducted from the safety reserve.
 * Caller must reject/regenerate an invalid plan rather than applying its times.
 */
export function buildExitSchedule(levels, objects, stairLinks, pathFn, options = {}) {
  const settings = {...BUDGET_SETTINGS, ...options};
  const errors = [], exits = [];
  const policy = {...settings, clock: 'absolute-global-seconds', baselineCloseSeconds: {...BASELINE_CLOSE},
    firstExitFloor: 4, finalExitFloor: 8, resetOnFloorEntry: false,
    reserveIncludesCompletionBuffer: true, exploredFloorsIncludeExitFloor: true};
  const result = () => ({exits, valid: errors.length === 0, errors, policy});
  for (const key of Object.keys(BUDGET_SETTINGS)) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0) errors.push(`Invalid budget setting: ${key}`);
  }
  for (const key of ['walkingSpeed', 'stairSpeed']) if (!(settings[key] > 0)) errors.push(`${key} must be positive`);
  if (settings.firstExitReserve < 90 || settings.firstExitReserve < settings.completionBufferSeconds) errors.push('Reserve must include at least 90 seconds and the completion buffer');
  if (settings.completionBufferSeconds < 5) errors.push('Final interaction buffer must be at least 5 seconds');
  if (settings.minExitDistance < 30) errors.push('Exit navigation separation must be at least 30 metres');
  if (settings.minWindowStep < 180) errors.push('Successive exit windows must be at least 180 seconds apart');
  if (options.finalCloseSeconds != null && (!Number.isFinite(options.finalCloseSeconds) || options.finalCloseSeconds <= 0)) errors.push('Invalid finalCloseSeconds');
  if (!Array.isArray(levels) || !Array.isArray(objects) || !Array.isArray(stairLinks)) errors.push('Levels, objects and stair links must be arrays');
  if (typeof pathFn !== 'function') errors.push('A navigation path function is required');
  if (errors.length) return result();

  const floors = new Map();
  for (const level of levels) {
    if (!Number.isInteger(level?.floor) || level.floor < 1 || level.floor > 8 || floors.has(level.floor)) errors.push(`Invalid or duplicate floor: ${level?.floor}`);
    else floors.set(level.floor, level);
  }
  for (let floor = 1; floor <= 8; floor++) if (!floors.has(floor)) errors.push(`Missing floor ${floor}`);
  const candidates = objects.filter(o => o?.type === 'exit').sort((a, b) => a.floor - b.floor || String(a.id).localeCompare(String(b.id)));
  const ids = new Set();
  for (const exit of candidates) {
    if (!exit.id || ids.has(exit.id)) errors.push(`Missing or duplicate exit id: ${exit.id}`);
    ids.add(exit.id);
  }
  for (let floor = 4; floor <= 8; floor++) if (!candidates.some(o => o.floor === floor)) errors.push(`Missing exit on floor ${floor}`);

  const navLength = (floor, a, b, list, label) => {
    if (!planarPoint(a) || !planarPoint(b)) { list.push(`${label}: invalid navigation endpoints`); return 0; }
    try {
      const path = pathFn(floor, a, b), length = pathLength(path);
      if (!Array.isArray(path) || !path.length || !Number.isFinite(length) ||
          distance(path[0], a) > .75 || distance(path.at(-1), b) > .75) {
        list.push(`${label}: unreachable or incomplete navigation route`); return 0;
      }
      return length;
    } catch (error) {
      list.push(`${label}: navigation failed (${error?.message || error})`); return 0;
    }
  };
  const stairLength = (floor, list) => {
    const a = floors.get(floor), b = floors.get(floor + 1);
    const matches = stairLinks.filter(l => l.fromFloor === floor && l.toFloor === floor + 1);
    if (matches.length !== 1 || !a || !b) { list.push(`Floor ${floor}: missing or ambiguous ascending stair link`); return 0; }
    const path = matches[0].path, length = pathLength(path, true);
    const start = {...a.stairUp, y: a.baseY}, end = {...b.stairDown, y: b.baseY};
    if (!spatialPoint(start) || !spatialPoint(end) || !Array.isArray(path) || path.length < 2 || !Number.isFinite(length) || length <= 0 ||
        distance(path[0], start, true) > .75 || distance(path.at(-1), end, true) > .75 || !(b.baseY > a.baseY)) {
      list.push(`Floor ${floor}: disconnected or invalid physical stair path`); return 0;
    }
    return length;
  };

  for (const object of candidates) {
    const {floor} = object, list = [], level = floors.get(floor);
    let walkDistance = 0, stairDistance = 0;
    if (!Number.isInteger(floor) || floor < 4 || floor > 8 || !level) list.push(`Exit ${object.id}: exits are only legal on floors 4–8`);
    else {
      // Route is run spawn -> first up stair -> actual stairs -> next entry/up,
      // repeated to this exit floor. No Euclidean shortcut through partitions.
      for (let f = 1; f < floor; f++) {
        const l = floors.get(f), entry = f === 1 ? l?.spawn : l?.stairDown;
        walkDistance += navLength(f, entry, l?.stairUp, list, `Floor ${f} ascent`);
        stairDistance += stairLength(f, list);
      }
      const entry = level.stairDown || level.spawn;
      const finalWalk = navLength(floor, entry, object, list, `Exit ${object.id} entry`);
      walkDistance += finalWalk;
      if (finalWalk < settings.minExitDistance) list.push(`Exit ${object.id}: less than ${settings.minExitDistance}m from entry along navigation`);
      if (level.spawn && distance(level.spawn, entry) > .01) {
        if (navLength(floor, level.spawn, object, list, `Exit ${object.id} spawn`) < settings.minExitDistance) list.push(`Exit ${object.id}: too close to spawn along navigation`);
      }
      if (level.stairUp && navLength(floor, level.stairUp, object, list, `Exit ${object.id} upstairs`) < settings.minExitDistance) list.push(`Exit ${object.id}: too close to upstairs along navigation`);
    }
    const budget = {
      walkSeconds: walkDistance / settings.walkingSpeed,
      verticalSeconds: stairDistance / settings.stairSpeed + (floor - 1) * settings.stairHandoffSeconds,
      searchSeconds: floor * settings.searchPerFloor,
      combatSeconds: floor * settings.combatPerFloor,
      stairTrialSeconds: (floor - 1) * settings.stairsSeconds,
      exitTrialSeconds: settings.exitSeconds,
      totalSeconds: 0,
      reserveSeconds: settings.firstExitReserve,
      slackSeconds: 0,
    };
    budget.totalSeconds = budget.walkSeconds + budget.verticalSeconds + budget.searchSeconds + budget.combatSeconds + budget.stairTrialSeconds + budget.exitTrialSeconds;
    exits.push({objectId: object.id, floor, closeAt: null, budget, pathDistance: walkDistance + stairDistance,
      walkDistance, stairDistance, reachable: list.length === 0, errors: list});
    errors.push(...list);
  }
  // Group by floor so multiple candidates on one floor share its latest safe
  // deadline; they must not consume each other's inter-floor spacing allowance.
  let previousClose = null;
  for (let floor = 4; floor <= 8; floor++) {
    const group = exits.filter(e => e.floor === floor);
    if (!group.length) continue;
    const alwaysOpen = floor === 8 && options.finalCloseSeconds == null;
    const needed = Math.max(...group.map(e => Math.ceil((e.budget.totalSeconds + e.budget.reserveSeconds) / 60) * 60));
    const closeAt = alwaysOpen ? null : Math.max(BASELINE_CLOSE[floor] || options.finalCloseSeconds || 0,
      needed, previousClose == null ? 0 : previousClose + settings.minWindowStep);
    for (const exit of group) {
      exit.closeAt = closeAt;
      exit.budget.slackSeconds = closeAt == null ? Infinity : closeAt - exit.budget.totalSeconds;
    }
    previousClose = closeAt;
  }
  return result();
}
