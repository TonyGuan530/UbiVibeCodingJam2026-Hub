// Serializable, per-enemy knowledge. A snapshot is never a live actor reference.
export const PERCEPTION = Object.freeze({
  melee: { sight: 12, halfAngle: Math.PI * .36, hearing: 1.25, search: 5 },
  ranged: { sight: 15, halfAngle: Math.PI * .33, hearing: 1.25, search: 6 },
  elite: { sight: 13, halfAngle: Math.PI * .39, hearing: 1.5, search: 7 },
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const positionSnapshot = a => ({ x: a.x, z: a.z, ...(Number.isFinite(a.y) ? { y: a.y } : {}), ...(a.floor !== undefined ? { floor: a.floor } : {}) });

export function canPerceive(enemy, actor, env = {}) {
  if (!actor || actor.alive === false || actor.hp === 0 || (actor.floor !== undefined && actor.floor !== enemy.floor)) return false;
  if (Math.abs((actor.y || 0) - (enemy.y || 0)) > 2.2) return false;
  const spec = PERCEPTION[enemy.kind] || PERCEPTION.melee, d = distance(enemy, actor);
  if (d > spec.sight || (env.lineClear && !env.lineClear(enemy, actor))) return false;
  // Near hearing still needs a clear local path; it cannot propagate through walls.
  if (d <= spec.hearing) return true;
  const facing = enemy.dir || 0;
  const dot = ((actor.x - enemy.x) * Math.sin(facing) + (actor.z - enemy.z) * Math.cos(facing)) / (d || 1);
  return dot >= Math.cos(spec.halfAngle);
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
    const previous = enemy.awareness;
    if (previous === 'idle' || previous === 'search') {
      enemy.awareness = 'alert'; enemy.alertTimer = .18;
      env.onAwareness?.(enemy, 'alert');
    } else if (previous === 'alert') {
      enemy.alertTimer = Math.max(0, (enemy.alertTimer || 0) - dt);
      if (!enemy.alertTimer) { enemy.awareness = 'chase'; env.onAwareness?.(enemy, 'chase'); }
    }
    enemy.targetIndex = index; enemy.lastKnown = positionSnapshot(actors[index]); enemy.searchTimer = spec.search;
    return { target: actors[index], visible: true, goal: enemy.lastKnown };
  }
  if (enemy.lastKnown) {
    if (enemy.awareness !== 'search') { enemy.awareness = 'search'; enemy.searchTimer = spec.search; env.onAwareness?.(enemy, 'search'); }
    enemy.searchTimer = Math.max(0, (enemy.searchTimer ?? spec.search) - dt);
    enemy.targetIndex = null;
    if (enemy.searchTimer > 0) return { target: null, visible: false, goal: enemy.lastKnown };
    enemy.lastKnown = null; enemy.awareness = 'idle'; env.onAwareness?.(enemy, 'idle');
  }
  return { target: null, visible: false, goal: null };
}
