// Timer logic with no screen, sound or clock in it, so it can be tested on its own.
//
// A workout is a list of phases ("get ready", "work", "rest"...). Given how many seconds
// have passed, locate() says which phase we are in and how much of it is left.

export const MODES = ['stopwatch', 'amrap', 'emom', 'tabata'];

export const DEFAULTS = {
  prep: 10, // "get ready" countdown before the workout starts
  amrapMinutes: 12,
  emomMinutes: 10,
  tabataWork: 20,
  tabataRest: 10,
  tabataRounds: 8,
};

export const LIMITS = {
  prep: [0, 60],
  amrapMinutes: [1, 180],
  emomMinutes: [1, 180],
  tabataWork: [1, 600],
  tabataRest: [0, 600],
  tabataRounds: [1, 99],
};

/** Keeps every setting a whole number inside sensible limits (empty/garbage -> default). */
export function normalizeConfig(cfg = {}) {
  const out = {};
  for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
    const n = Math.round(Number(cfg[key]));
    out[key] = Number.isFinite(n) && cfg[key] !== '' && cfg[key] !== null ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[key];
  }
  return out;
}

/** The ordered phases of a workout. `duration` is in seconds (Infinity = counts up forever). */
export function buildPhases(mode, rawCfg) {
  const cfg = normalizeConfig(rawCfg);
  const phases = [];
  if (cfg.prep > 0) phases.push({ kind: 'prep', duration: cfg.prep });

  switch (mode) {
    case 'stopwatch':
      phases.push({ kind: 'up', duration: Infinity });
      break;
    case 'amrap':
      phases.push({ kind: 'work', duration: cfg.amrapMinutes * 60 });
      break;
    case 'emom':
      for (let minute = 1; minute <= cfg.emomMinutes; minute++) {
        phases.push({ kind: 'work', duration: 60, minute, minutes: cfg.emomMinutes });
      }
      break;
    case 'tabata':
      for (let round = 1; round <= cfg.tabataRounds; round++) {
        phases.push({ kind: 'work', duration: cfg.tabataWork, round, rounds: cfg.tabataRounds });
        if (cfg.tabataRest > 0) phases.push({ kind: 'rest', duration: cfg.tabataRest, round, rounds: cfg.tabataRounds });
      }
      break;
    default:
      throw new Error(`Unknown timer mode: ${mode}`);
  }
  return phases;
}

/** Total length in seconds (Infinity for the stopwatch). */
export const totalDuration = (phases) => phases.reduce((sum, p) => sum + p.duration, 0);

/**
 * Where are we after `elapsed` seconds?
 * -> { finished, index, phase, into, remaining, left }
 *    into: seconds spent in this phase, remaining: seconds left in it,
 *    left: seconds left in the whole workout (Infinity for the stopwatch).
 */
export function locate(phases, elapsed) {
  const total = totalDuration(phases);
  let start = 0;
  for (let index = 0; index < phases.length; index++) {
    const phase = phases[index];
    if (elapsed < start + phase.duration) {
      const into = Math.max(0, elapsed - start);
      return { finished: false, index, phase, into, remaining: phase.duration - into, left: total - elapsed };
    }
    start += phase.duration;
  }
  return { finished: true, index: phases.length, phase: null, into: 0, remaining: 0, left: 0 };
}

/** What sound should play now? Compares the previous and the current position. */
export function cueFor(prev, now) {
  if (!now) return null;
  if (now.finished && !(prev && prev.finished)) return 'finish';
  if (now.finished) return null;

  const phaseChanged = !prev || prev.index !== now.index;
  if (phaseChanged && prev) {
    // a new phase just started
    if (now.phase.kind === 'work') return 'go';
    if (now.phase.kind === 'rest') return 'rest';
  }
  if (phaseChanged && !prev && now.phase.kind !== 'prep') return 'go'; // started without a countdown

  // the last 3 seconds of a phase tick (only phases longer than 3s, and never for the stopwatch)
  if (Number.isFinite(now.remaining) && now.phase.duration > 3) {
    const secs = Math.ceil(now.remaining);
    const prevSecs = prev && prev.index === now.index ? Math.ceil(prev.remaining) : null;
    if (secs <= 3 && secs >= 1 && secs !== prevSecs) return 'tick';
  }
  return null;
}

/** Seconds -> "m:ss" (or "h:mm:ss"); counts a partial second as the next one when counting down. */
export function clock(seconds, { roundUp = false } = {}) {
  const whole = Math.max(0, roundUp ? Math.ceil(seconds) : Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
