// Browser-free trial rules. Progress is elapsed seconds, never a 0..1 ratio.
export const TRIAL_SETTINGS = Object.freeze({ stairsSeconds: 22, exitSeconds: 32, radius: 4.5, spawnEvery: 5 });

export function createTrial(location) {
  const kind = location.type === 'exit' ? 'exit' : 'stairs';
  return { id: `trial:${location.id}`, objectId: location.id, floor: location.floor,
    kind, x: location.x, z: location.z, radius: TRIAL_SETTINGS.radius,
    duration: kind === 'exit' ? TRIAL_SETTINGS.exitSeconds : TRIAL_SETTINGS.stairsSeconds,
    progress: 0, status: 'idle', waveTimer: 0, closeAt: null };
}

const event = (trial, type, extra = {}) => ({ type, trialId: trial.id, objectId: trial.objectId, ...extra });
const closed = (trial, now, closeAt) => trial.kind === 'exit' && closeAt != null && now >= closeAt;
const fail = trial => {
  trial.status = 'failed';
  return event(trial, 'failed', { reason: 'closed' });
};

// This function is the E key edge, with no hold/preparation timer. Repeated E
// never resets progress; the caller uses canUseTrial for the separate final E.
export function startTrial(trial, now, closeAt = trial.closeAt) {
  if (trial.status === 'failed') return { ok: false, event: null };
  if (closed(trial, now, closeAt)) return { ok: false, event: fail(trial) };
  if (trial.status !== 'idle') return { ok: false, event: null };
  trial.closeAt = closeAt;
  trial.status = 'running';
  return { ok: true, event: event(trial, 'started') };
}

export function canUseTrial(trial, now, closeAt = trial.closeAt) {
  return trial.status === 'completed' && !closed(trial, now, closeAt);
}

// env.spawn(floor, {x,z,radius}, requestedCount) owns legal positions, excludes
// the circle and player feet, uses floor/global threat, and returns actual count.
// enemyCount/Limit are the same live budget used by natural spawning. Main must
// update that count between trial ticks when processing multiple trial objects.
// waveCount optionally selects 1..3 enemies; default 2. No spawn debt is queued.
export function tickTrial(trial, dt, env) {
  const closeAt = env.closeAt === undefined ? trial.closeAt : env.closeAt;
  if (trial.status !== 'idle' && trial.status !== 'failed' && closed(trial, env.now, closeAt)) {
    return [fail(trial)];
  }
  if (trial.status !== 'running' && trial.status !== 'paused') return [];

  const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const events = [];
  const sameFloor = env.player?.floor === trial.floor;
  const inside = sameFloor && Math.hypot(env.player.x - trial.x, env.player.z - trial.z) <= trial.radius;
  if (!inside && trial.status === 'running') {
    trial.status = 'paused';
    events.push(event(trial, 'paused'));
  } else if (inside && trial.status === 'paused') {
    trial.status = 'running';
    events.push(event(trial, 'resumed'));
  }

  // Pausing progress does not pause local combat pressure. Other floors are not
  // simulated by this prototype, so do not create unseen off-floor enemies.
  trial.waveTimer = Math.max(0, trial.waveTimer - seconds);
  if (trial.waveTimer <= 1e-9) {
    trial.waveTimer = TRIAL_SETTINGS.spawnEvery;
    const capacity = Number.isFinite(env.enemyLimit) && Number.isFinite(env.enemyCount)
      ? Math.max(0, Math.floor(env.enemyLimit - Math.max(0, env.enemyCount))) : 0;
    const waveCount = Number.isFinite(env.waveCount) ? Math.max(1, Math.min(3, Math.floor(env.waveCount))) : 2;
    const requested = Math.min(capacity, waveCount);
    if (sameFloor && requested > 0 && typeof env.spawn === 'function') {
      const actual = env.spawn(trial.floor, { x: trial.x, z: trial.z, radius: trial.radius }, requested);
      const count = Number.isFinite(actual) ? Math.max(0, Math.min(requested, Math.floor(actual))) : 0;
      events.push(event(trial, 'wave', { requested, count }));
    }
  }

  if (inside) {
    trial.progress = Math.min(trial.duration, trial.progress + seconds);
    if (trial.progress >= trial.duration) {
      trial.status = 'completed';
      events.push(event(trial, 'completed'));
    }
  }
  return events;
}
