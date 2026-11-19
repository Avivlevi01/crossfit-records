// The workout timer: stopwatch, AMRAP, EMOM and Tabata.
//
// The running timer lives in this module (not in the screen), so it keeps going and keeps
// beeping if you open another tab of the app in the middle of a workout. The screen just
// shows its current state. It is a separate tool: it doesn't create records.

import { h, icon } from './dom.js';
import { t } from './i18n.js';
import { LIMITS, MODES, buildPhases, clock, cueFor, locate, normalizeConfig, totalDuration } from './timer-core.js';
import { allowSleep, isMuted, keepAwake, playCue, setMuted, unlockAudio } from './timer-audio.js';

// ---------- saved settings ----------

const SETTINGS_KEY = 'timerSettings';

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return { mode: MODES.includes(saved?.mode) ? saved.mode : 'stopwatch', cfg: normalizeConfig(saved?.cfg) };
  } catch {
    return { mode: 'stopwatch', cfg: normalizeConfig({}) };
  }
}

const settings = loadSettings();

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage blocked: settings just won't be remembered */
  }
}

// ---------- the engine (one running workout) ----------

const run = {
  status: 'idle', // idle | running | paused | done
  mode: 'stopwatch',
  phases: [],
  elapsedBefore: 0, // seconds already counted before the current run segment
  startedAt: 0, // performance.now() when the current segment started
  prev: null, // previous position, used to decide when to beep
  rounds: 0, // AMRAP round counter
  interval: null,
};

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

/** Subscribe to timer changes. Returns an "unsubscribe" function. */
export function subscribeTimer(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True while a workout is running or paused (the tab shows a dot). */
export const timerActive = () => run.status === 'running' || run.status === 'paused';

const elapsed = () =>
  run.status === 'running' ? run.elapsedBefore + (performance.now() - run.startedAt) / 1000 : run.elapsedBefore;

function tick() {
  const now = locate(run.phases, elapsed());
  const cue = cueFor(run.prev, now);
  if (cue) playCue(cue);
  run.prev = now;
  if (now.finished) {
    clearInterval(run.interval);
    run.status = 'done';
    run.elapsedBefore = totalDuration(run.phases);
    allowSleep();
  }
  emit();
}

function startTicking() {
  clearInterval(run.interval);
  run.interval = setInterval(tick, 100);
}

function start() {
  unlockAudio(); // must happen inside the tap that starts the workout
  keepAwake();
  run.mode = settings.mode;
  run.phases = buildPhases(run.mode, settings.cfg);
  run.elapsedBefore = 0;
  run.startedAt = performance.now();
  run.prev = null;
  run.rounds = 0;
  run.status = 'running';
  startTicking();
  tick();
}

function pause() {
  run.elapsedBefore = elapsed();
  run.status = 'paused';
  clearInterval(run.interval);
  allowSleep();
  emit();
}

function resume() {
  unlockAudio();
  keepAwake();
  run.startedAt = performance.now();
  run.status = 'running';
  startTicking();
  tick();
}

function reset() {
  clearInterval(run.interval);
  run.status = 'idle';
  run.elapsedBefore = 0;
  run.prev = null;
  run.rounds = 0;
  allowSleep();
  emit();
}

/** Stops and clears the workout (used when logging out). */
export const stopTimer = reset;

// the phone may release the "screen on" lock when the page is hidden: take it again when back
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && run.status === 'running') keepAwake();
});

// ---------- the screen ----------

let unsubscribe = null;

/** Call when leaving the timer screen (the timer itself keeps running). */
export function leaveTimer() {
  unsubscribe?.();
  unsubscribe = null;
}

const FIELDS = {
  stopwatch: [],
  amrap: [['amrapMinutes', 'set_minutes']],
  emom: [['emomMinutes', 'set_minutes']],
  tabata: [['tabataWork', 'set_work'], ['tabataRest', 'set_rest'], ['tabataRounds', 'set_rounds']],
};

export function buildTimerView() {
  leaveTimer();
  let drawnStatus = null;

  const muteBtn = h('button', {
    type: 'button', class: 'chip icon-chip',
    onclick: () => { setMuted(!isMuted()); drawMute(); },
  });
  function drawMute() {
    muteBtn.replaceChildren(icon(isMuted() ? 'mute' : 'volume'), isMuted() ? t('timer_unmute') : t('timer_mute'));
    muteBtn.setAttribute('aria-pressed', String(isMuted()));
  }
  drawMute();

  const modeBar = h('div', { class: 'seg-group modes' }, MODES.map((m) =>
    h('button', {
      type: 'button', class: 'seg', 'data-mode': m,
      onclick: () => { settings.mode = m; saveSettings(); drawSettings(); update(); },
    }, t(`mode_${m}`)),
  ));
  const help = h('p', { class: 'mode-help' });
  const settingsBox = h('div', { class: 'timer-settings' });

  // ----- the big display -----
  const phaseEl = h('div', { class: 'timer-phase' });
  const timeEl = h('div', { class: 'timer-time', dir: 'ltr', role: 'timer' });
  const tenthsEl = h('span', { class: 'tenths' });
  const subEl = h('div', { class: 'timer-sub' });
  const barFill = h('i');
  const face = h('div', { class: 'timer-face', 'data-state': 'idle' },
    phaseEl,
    h('div', { class: 'timer-clock' }, timeEl, tenthsEl),
    subEl,
    h('div', { class: 'timer-bar', dir: 'ltr' }, barFill),
  );

  // ----- AMRAP round counter -----
  const roundsNum = h('b', { class: 'display' }, '0');
  const roundsBox = h('div', { class: 'timer-rounds', hidden: true },
    h('button', { type: 'button', class: 'btn ghost small', 'aria-label': '-1', onclick: () => { run.rounds = Math.max(0, run.rounds - 1); emit(); } }, '−'),
    h('div', { class: 'rounds-count' }, h('small', {}, t('timer_rounds_done')), roundsNum),
    h('button', { type: 'button', class: 'btn primary', onclick: () => { run.rounds += 1; emit(); } }, icon('plus'), t('timer_round_plus')),
  );

  const actions = h('div', { class: 'timer-actions' });
  function drawActions() {
    const btn = (label, ic, fn, cls) => h('button', { type: 'button', class: `btn ${cls}`, onclick: fn }, icon(ic), label);
    const sets = {
      idle: [btn(t('timer_start'), 'play', start, 'primary big')],
      running: [btn(t('timer_pause'), 'pause', pause, 'primary big')],
      paused: [btn(t('timer_resume'), 'play', resume, 'primary big'), btn(t('timer_reset'), 'reset', reset, 'ghost')],
      done: [btn(t('timer_reset'), 'reset', reset, 'primary big')],
    };
    actions.replaceChildren(...sets[run.status]);
  }

  // ----- settings for the chosen mode -----
  function numberField(key, labelKey) {
    const [lo, hi] = LIMITS[key];
    const input = h('input', {
      id: `s-${key}`, type: 'number', inputmode: 'numeric', min: lo, max: hi, step: 1, value: String(settings.cfg[key]),
      oninput: () => { settings.cfg = normalizeConfig({ ...settings.cfg, [key]: input.value }); saveSettings(); update(); },
      onchange: () => { input.value = String(settings.cfg[key]); }, // show the corrected value once typing ends
    });
    return h('div', { class: 'field' }, h('label', { for: `s-${key}` }, t(labelKey)), input);
  }

  function prepField() {
    const options = [...new Set([0, 5, 10, 15, 30, settings.cfg.prep])].sort((a, b) => a - b);
    const select = h('select', {
      id: 's-prep', value: String(settings.cfg.prep),
      onchange: () => { settings.cfg = normalizeConfig({ ...settings.cfg, prep: select.value }); saveSettings(); update(); },
    }, options.map((n) => h('option', { value: String(n) }, String(n))));
    return h('div', { class: 'field' }, h('label', { for: 's-prep' }, t('set_prep')), select);
  }

  function drawSettings() {
    settingsBox.replaceChildren(...FIELDS[settings.mode].map(([key, label]) => numberField(key, label)), prepField());
  }
  drawSettings();

  // ----- refresh everything from the engine state -----
  function update() {
    const idle = run.status === 'idle';
    const mode = idle ? settings.mode : run.mode;
    modeBar.hidden = settingsBox.hidden = help.hidden = !idle;
    modeBar.querySelectorAll('.seg').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === settings.mode);
      b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode));
    });
    help.textContent = t(`help_${settings.mode}`);

    if (drawnStatus !== run.status) {
      drawnStatus = run.status;
      drawActions();
    }
    roundsBox.hidden = !(mode === 'amrap' && !idle);
    roundsNum.textContent = String(run.rounds);
    face.toggleAttribute('data-paused', run.status === 'paused');

    let state = 'idle';
    let time = '';
    let tenths = '';
    let sub = '';
    let progress = 0;
    let label = t(`mode_${mode}`);

    if (idle) {
      const phases = buildPhases(settings.mode, settings.cfg);
      const total = totalDuration(phases) - settings.cfg.prep;
      time = settings.mode === 'stopwatch' ? '0:00' : clock(total);
      if (settings.mode === 'tabata') sub = `${settings.cfg.tabataRounds} × ${settings.cfg.tabataWork}/${settings.cfg.tabataRest}`;
    } else {
      const here = locate(run.phases, elapsed());
      if (here.finished) {
        state = 'done';
        label = t('t_done');
        const prepLen = run.phases[0]?.kind === 'prep' ? run.phases[0].duration : 0;
        time = clock(totalDuration(run.phases) - prepLen);
        progress = 1;
      } else {
        const phase = here.phase;
        state = phase.kind;
        label = { prep: t('t_prep'), work: t('t_work'), rest: t('t_rest'), up: t(`mode_${mode}`) }[phase.kind];
        if (phase.kind === 'up') {
          time = clock(here.into);
          tenths = `.${Math.floor((here.into * 10) % 10)}`;
        } else {
          time = clock(here.remaining, { roundUp: true });
          progress = here.into / phase.duration;
        }
        if (phase.round) sub = `${t('t_round', { r: phase.round, n: phase.rounds })} · ${t('t_left', { time: clock(here.left, { roundUp: true }) })}`;
        if (phase.minute) sub = `${t('t_minute', { m: phase.minute, n: phase.minutes })} · ${t('t_left', { time: clock(here.left, { roundUp: true }) })}`;
        if (run.status === 'paused') sub = t('t_paused');
      }
    }
    face.dataset.state = state;
    phaseEl.textContent = label;
    timeEl.textContent = time;
    tenthsEl.textContent = tenths;
    subEl.textContent = sub;
    subEl.dir = idle ? 'ltr' : ''; // "2 × 20/10" is all numbers: keep its order on a Hebrew page
    barFill.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    barFill.parentElement.hidden = state === 'idle' || state === 'up';
  }

  unsubscribe = subscribeTimer(update);
  update();

  return h('section', { class: 'timer-page' },
    h('div', { class: 'page-head' }, h('h2', { class: 'display' }, t('timer_title')), muteBtn),
    modeBar,
    help,
    face,
    roundsBox,
    actions,
    settingsBox, // below the big display and the Start button, so Start is on the first screen
  );
}
