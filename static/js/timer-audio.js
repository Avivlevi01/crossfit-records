// Beeps, vibration and "keep the screen on" for the timer. Every piece is optional:
// if the phone/browser doesn't support something, the timer simply works without it.

const MUTE_KEY = 'timerMuted';

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  /* storage blocked: sound stays on */
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Browsers only allow sound after a tap, so call this from the Start button's click. */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq, durationMs, delayMs = 0, volume = 0.35) {
  if (!ctx) return;
  const start = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  // quick fade in/out so the beep doesn't click
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.05);
}

const buzz = (pattern) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
};

/** cue: 'tick' (3-2-1), 'go' (work starts), 'rest', 'finish' */
export function playCue(cue) {
  if (muted) return; // the mute button silences sound AND vibration
  switch (cue) {
    case 'tick':
      tone(880, 110);
      buzz(40);
      break;
    case 'go':
      tone(1320, 420);
      buzz(220);
      break;
    case 'rest':
      tone(660, 130);
      tone(660, 130, 190);
      buzz([90, 70, 90]);
      break;
    case 'finish':
      tone(660, 260);
      tone(660, 260, 340);
      tone(990, 800, 680);
      buzz([300, 100, 300, 100, 700]);
      break;
    default:
  }
}

// ---- keep the screen awake while a workout runs ----

let wakeLock = null;

export async function keepAwake() {
  try {
    if (!wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {
    wakeLock = null; // not allowed right now (battery saver, hidden page...)
  }
}

export async function allowSleep() {
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}
