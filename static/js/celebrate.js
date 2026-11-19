// The big moment: a full-screen celebration when someone breaks a personal record.
// All animation lives in CSS (css/app.css, "PR celebration"); users who prefer reduced
// motion get the same screen without movement.

import { h, s } from './dom.js';
import { t } from './i18n.js';
import { improvementText, valueText } from './format.js';

const SPARKS = 44;

function barbell() {
  const plate = (x, w, hgt, cls) => s('rect', { class: `plate ${cls}`, x, y: 45 - hgt / 2, width: w, height: hgt, rx: 3 });
  return s('svg', { class: 'pr-bar', viewBox: '0 0 300 90', 'aria-hidden': 'true' },
    s('rect', { class: 'bar-shaft', x: 6, y: 42, width: 288, height: 6, rx: 3 }),
    plate(52, 12, 84, 'p1'), plate(64, 10, 72, 'p2'), plate(74, 8, 58, 'p3'),
    s('rect', { class: 'collar', x: 82, y: 38, width: 6, height: 14, rx: 2 }),
    plate(236, 12, 84, 'p1'), plate(226, 10, 72, 'p2'), plate(218, 8, 58, 'p3'),
    s('rect', { class: 'collar', x: 212, y: 38, width: 6, height: 14, rx: 2 }),
  );
}

function burst() {
  const box = h('div', { class: 'pr-burst', 'aria-hidden': 'true' }, h('i', { class: 'pr-ring' }), h('i', { class: 'pr-ring r2' }));
  for (let i = 0; i < SPARKS; i++) {
    const angle = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 90 + Math.random() * 190;
    const spark = h('i', { class: `spark c${i % 3}` });
    spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    spark.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
    spark.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
    spark.style.animationDelay = `${0.62 + Math.random() * 0.18}s`;
    box.append(spark);
  }
  return box;
}

/** `rec` is the record the server returned right after saving (with `celebration`). */
export function celebratePR(rec) {
  const kind = rec.exercise.kind;
  const prev = rec.celebration?.previous;
  let timer;

  const close = () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') close();
  };
  const go = h('button', { type: 'button', class: 'btn primary', onclick: close }, t('pr_go'));
  const delta = improvementText(kind, rec, prev);

  const overlay = h('div', { class: 'pr-overlay', role: 'alertdialog', 'aria-label': t('pr_title'), onclick: close },
    burst(),
    h('div', { class: 'pr-stage' },
      barbell(),
      h('div', { class: 'pr-card' },
        h('p', { class: 'pr-kicker display' }, t('pr_title')),
        h('h2', { class: 'pr-exercise display' }, rec.exercise.name),
        h('div', { class: 'pr-value display', dir: 'ltr' }, valueText(rec)),
        delta ? h('p', { class: 'pr-delta', dir: 'ltr' }, delta) : null,
        prev ? h('p', { class: 'pr-prev' }, `${t('pr_prev')}: `, h('bdi', { dir: 'ltr' }, valueText({ exercise: rec.exercise, ...prev }))) : null,
        go,
      ),
    ),
  );

  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  go.focus({ preventScroll: true });
  navigator.vibrate?.([70, 40, 150]); // a buzz on phones that support it
  timer = setTimeout(close, 7000);
}
