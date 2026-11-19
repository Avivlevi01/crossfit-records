// Run with:  node --test tests/js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPhases, clock, cueFor, DEFAULTS, locate, normalizeConfig, totalDuration } from '../../static/js/timer-core.js';

const kinds = (phases) => phases.map((p) => p.kind).join(',');

test('defaults match what was agreed: Tabata 20/10 x 8, EMOM 10 min', () => {
  assert.equal(DEFAULTS.tabataWork, 20);
  assert.equal(DEFAULTS.tabataRest, 10);
  assert.equal(DEFAULTS.tabataRounds, 8);
  assert.equal(DEFAULTS.emomMinutes, 10);
});

test('tabata: prep, then work/rest x rounds, 4:00 + prep in total', () => {
  const phases = buildPhases('tabata', {});
  assert.equal(kinds(phases), 'prep,' + 'work,rest,'.repeat(8).slice(0, -1));
  assert.equal(totalDuration(phases), 10 + 8 * 30);
  assert.deepEqual(phases[1], { kind: 'work', duration: 20, round: 1, rounds: 8 });
});

test('emom: one 60-second phase per minute', () => {
  const phases = buildPhases('emom', { prep: 0, emomMinutes: 3 });
  assert.equal(kinds(phases), 'work,work,work');
  assert.equal(totalDuration(phases), 180);
  assert.equal(phases[2].minute, 3);
  assert.equal(phases[2].minutes, 3);
});

test('amrap: a single countdown', () => {
  const phases = buildPhases('amrap', { prep: 5, amrapMinutes: 12 });
  assert.equal(kinds(phases), 'prep,work');
  assert.equal(phases[1].duration, 720);
});

test('stopwatch: counts up forever and never finishes', () => {
  const phases = buildPhases('stopwatch', { prep: 0 });
  assert.equal(totalDuration(phases), Infinity);
  const where = locate(phases, 999999);
  assert.equal(where.finished, false);
  assert.equal(where.into, 999999);
});

test('tabata with no rest has no rest phases', () => {
  assert.equal(kinds(buildPhases('tabata', { prep: 0, tabataRest: 0, tabataRounds: 2 })), 'work,work');
});

test('unknown mode is an error', () => {
  assert.throws(() => buildPhases('zumba', {}));
});

test('locate: boundaries belong to the next phase, remaining counts down', () => {
  const phases = buildPhases('tabata', { prep: 10, tabataRounds: 2 });
  let at = locate(phases, 0);
  assert.equal(at.phase.kind, 'prep');
  assert.equal(at.remaining, 10);
  at = locate(phases, 9.5);
  assert.equal(at.phase.kind, 'prep');
  assert.equal(at.remaining, 0.5);
  at = locate(phases, 10);
  assert.equal(at.phase.kind, 'work');
  assert.equal(at.into, 0);
  at = locate(phases, 30);
  assert.equal(at.phase.kind, 'rest');
  assert.equal(at.remaining, 10);
  at = locate(phases, 70);
  assert.equal(at.finished, true);
  assert.equal(at.left, 0);
});

test('locate reports the time left in the whole workout', () => {
  const phases = buildPhases('emom', { prep: 0, emomMinutes: 2 });
  assert.equal(locate(phases, 45).left, 75);
});

test('settings are clamped to whole numbers inside limits; garbage falls back to defaults', () => {
  const cfg = normalizeConfig({ prep: -5, amrapMinutes: 9999, tabataWork: '17.6', tabataRest: 'abc', tabataRounds: '' });
  assert.equal(cfg.prep, 0);
  assert.equal(cfg.amrapMinutes, 180);
  assert.equal(cfg.tabataWork, 18);
  assert.equal(cfg.tabataRest, DEFAULTS.tabataRest);
  assert.equal(cfg.tabataRounds, DEFAULTS.tabataRounds);
  assert.equal(cfg.emomMinutes, DEFAULTS.emomMinutes);
});

test('sounds: ticks in the last 3 seconds, once each, then go / rest / finish', () => {
  const phases = buildPhases('tabata', { prep: 5, tabataRounds: 1, tabataWork: 5, tabataRest: 5 });
  const cues = [];
  let prev = null;
  // simulate a 10 Hz clock for the whole workout (+ a bit after the end)
  for (let ms = 0; ms <= 15500; ms += 100) {
    const now = locate(phases, ms / 1000);
    const cue = cueFor(prev, now);
    if (cue) cues.push([Math.round(ms / 100) / 10, cue]);
    prev = now;
  }
  assert.deepEqual(cues, [
    [2, 'tick'], [3, 'tick'], [4, 'tick'], // get ready: 3, 2, 1
    [5, 'go'],                              // work starts
    [7, 'tick'], [8, 'tick'], [9, 'tick'], // last 3 seconds of work
    [10, 'rest'],
    [12, 'tick'], [13, 'tick'], [14, 'tick'],
    [15, 'finish'],
  ]);
});

test('sounds: EMOM beeps at the start of every minute', () => {
  const phases = buildPhases('emom', { prep: 0, emomMinutes: 2 });
  const cues = [];
  let prev = null;
  for (let ms = 0; ms <= 121000; ms += 100) {
    const now = locate(phases, ms / 1000);
    const cue = cueFor(prev, now);
    if (cue && cue !== 'tick') cues.push([ms / 1000, cue]);
    prev = now;
  }
  assert.deepEqual(cues, [[0, 'go'], [60, 'go'], [120, 'finish']]);
});

test('sounds: stopwatch is silent after the start', () => {
  const phases = buildPhases('stopwatch', { prep: 0 });
  const cues = [];
  let prev = null;
  for (let ms = 0; ms <= 20000; ms += 100) {
    const now = locate(phases, ms / 1000);
    const cue = cueFor(prev, now);
    if (cue) cues.push(cue);
    prev = now;
  }
  assert.deepEqual(cues, ['go']);
});

test('sounds: a cue is not repeated when the clock stalls (background tab)', () => {
  const phases = buildPhases('amrap', { prep: 0, amrapMinutes: 1 });
  const a = locate(phases, 57.2);
  assert.equal(cueFor(locate(phases, 56.9), a), 'tick');
  assert.equal(cueFor(a, locate(phases, 57.6)), null); // same second: no repeat
});

test('clock formatting', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(65.9), '1:05');
  assert.equal(clock(65.1, { roundUp: true }), '1:06');
  assert.equal(clock(3725), '1:02:05');
  assert.equal(clock(-3), '0:00');
});
