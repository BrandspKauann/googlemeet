const MAX_ELAPSED = 7 * 24 * 60 * 60 * 1000;
const reject = (status, message) => {throw Object.assign(new Error(message), {status});};
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export function lessonSettings(input = {}) {
  const stored = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const status = ['idle', 'running', 'paused'].includes(stored.status) ? stored.status : 'idle';
  const startedAt = stamp(stored.startedAt), runningSince = stamp(stored.runningSince);
  return {
    v: 1,
    durationMinutes: Number.isInteger(stored.durationMinutes) && stored.durationMinutes >= 5 && stored.durationMinutes <= 240 ? stored.durationMinutes : 50,
    status: status === 'running' && !runningSince ? 'paused' : status,
    startedAt, runningSince: status === 'running' ? runningSince : null,
    elapsedMs: Number.isFinite(stored.elapsedMs) ? Math.max(0, Math.min(MAX_ELAPSED, Math.floor(stored.elapsedMs))) : 0,
    captionsEnabled: stored.captionsEnabled !== false,
  };
}

export function updateLessonSettings(stored, patch, now = Date.now()) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['action', 'durationMinutes', 'captionsEnabled'].includes(key))) reject(400, 'Configuração da aula inválida.');
  if (!Object.keys(patch).length) reject(400, 'Informe a alteração da aula.');
  if (patch.action !== undefined && !['start', 'pause', 'resume', 'reset'].includes(patch.action)) reject(400, 'Ação de cronômetro inválida.');
  if (patch.durationMinutes !== undefined && (!Number.isInteger(patch.durationMinutes) || patch.durationMinutes < 5 || patch.durationMinutes > 240)) reject(400, 'A duração deve ser de 5 a 240 minutos.');
  if (patch.captionsEnabled !== undefined && typeof patch.captionsEnabled !== 'boolean') reject(400, 'Informe se a tradução está ativada.');
  const next = lessonSettings(stored), iso = new Date(now).toISOString();
  if (patch.durationMinutes !== undefined) next.durationMinutes = patch.durationMinutes;
  if (patch.captionsEnabled !== undefined) next.captionsEnabled = patch.captionsEnabled;
  if (patch.action === 'reset') Object.assign(next, {status: 'idle', startedAt: null, runningSince: null, elapsedMs: 0});
  else if (patch.action === 'start' || patch.action === 'resume') {
    if (next.status !== 'running') {
      if (next.status === 'idle') {next.startedAt = iso; next.elapsedMs = 0;}
      next.status = 'running'; next.runningSince = iso;
    }
  } else if (patch.action === 'pause' && next.status === 'running') {
    next.elapsedMs = Math.min(MAX_ELAPSED, next.elapsedMs + Math.max(0, now - Date.parse(next.runningSince)));
    next.status = 'paused'; next.runningSince = null;
  }
  return next;
}

export function publicLessonSettings(stored, now = Date.now()) {
  return {...lessonSettings(stored), serverNow: new Date(now).toISOString()};
}
