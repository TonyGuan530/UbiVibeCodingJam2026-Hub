// Serializable, per-enemy knowledge. A snapshot is never a live actor reference.
export const PERCEPTION = Object.freeze({
  melee: { radius: 12, search: 5 },
  ranged: { radius: 15, search: 6 },
  elite: { radius: 13, search: 7 },
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const positionSnapshot = a => ({ x: a.x, z: a.z, ...(Number.isFinite(a.y) ? { y: a.y } : {}), ...(a.floor !== undefined ? { floor: a.floor } : {}) });

export function canPerceive(enemy, actor, env = {}) {
  if (!actor || actor.alive === false || actor.hp === 0 || (actor.floor !== undefined && actor.floor !== enemy.floor)) return false;
  if (Math.abs((actor.y || 0) - (enemy.y || 0)) > 2.2) return false;
  const spec = PERCEPTION[enemy.kind] || PERCEPTION.melee;
  return distance(enemy, actor) <= spec.radius;
}

export function updatePerception(enemy, actors, dt, env = {}) {
  const spec = PERCEPTION[enemy.kind] || PERCEPTION.melee;
  enemy.awareness ??= 'idle'; enemy.targetIndex ??= null; enemy.lastKnown ??= null;
  let index = enemy.targetIndex;
  if (index === null || !canPerceive(enemy, actors[index], env)) {
    index = null; let closest = Infinity;
    for (let i = 0; i < actors.length; i++) {
      const d = distance(enemy, actors[i]);
      if (d < closest && canPerceive(enemy, actors[i], env)) { index = i; closest = d; }
    }
  }
  if (index !== null) {
    if (enemy.awareness !== 'chase') {
      enemy.awareness = 'chase'; enemy.alertTimer = 0;
      env.onAwareness?.(enemy, 'chase');
    }
    enemy.targetIndex = index; enemy.lastKnown = positionSnapshot(actors[index]); enemy.searchTimer = spec.search;
    return { target: actors[index], detected: true, goal: enemy.lastKnown };
  }
  if (enemy.lastKnown) {
    if (enemy.awareness !== 'search') { enemy.awareness = 'search'; enemy.searchTimer = spec.search; env.onAwareness?.(enemy, 'search'); }
    enemy.searchTimer = Math.max(0, (enemy.searchTimer ?? spec.search) - dt);
    enemy.targetIndex = null;
    if (enemy.searchTimer > 0) return { target: null, detected: false, goal: enemy.lastKnown };
    enemy.lastKnown = null; enemy.awareness = 'idle'; env.onAwareness?.(enemy, 'idle');
  }
  return { target: null, detected: false, goal: null };
}
