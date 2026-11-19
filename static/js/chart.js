// Progress chart for one exercise: a hand-drawn SVG line chart (no chart library needed).
// Gold points are records that broke the PR; the biggest one is the current PR.

import { h, s } from './dom.js';
import { t } from './i18n.js';
import { fmtDate, fmtNum, fmtTime, paceSeconds, valueText } from './format.js';

const fmtPace = (v) => fmtTime(Math.round(v));
const fmtMeters = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(2)}km` : `${fmtNum(v)}m`); // plain units: axis labels are tiny

// What can be plotted for each kind of exercise. `lowerBetter` metrics are drawn upside down,
// so an improving line always goes UP, whatever is being measured.
const METRICS = {
  weight_reps: [
    { label: 'chart_weight', get: (r) => r.weight_kg, fmt: fmtNum },
    { label: 'chart_1rm', get: (r) => r.est_1rm, fmt: fmtNum },
  ],
  reps_only: [{ label: 'chart_reps', get: (r) => r.reps, fmt: fmtNum }],
  time: [{ label: 'chart_time', get: (r) => r.time_seconds, fmt: fmtTime, lowerBetter: true }],
  distance_time: [
    { label: 'chart_distance', get: (r) => r.distance_m, fmt: fmtMeters },
    { label: 'chart_time', get: (r) => r.time_seconds, fmt: fmtTime, lowerBetter: true },
    { label: 'chart_pace', get: paceSeconds, fmt: fmtPace, lowerBetter: true },
  ],
};

const HEIGHT = 210;
const PAD = { left: 46, right: 16, top: 16, bottom: 28 };

/** A "round" step size (1, 2, 2.5, 5 x power of ten) so axis labels look tidy. */
function niceStep(rough) {
  const pow = 10 ** Math.floor(Math.log10(rough));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= rough) ?? 10) * pow;
}

const dayMs = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

export function progressChart(records, kind) {
  const metrics = METRICS[kind];
  let metric = metrics[0];
  let selected = null;
  let drawnWidth = 0;
  const ordered = [...records].sort((a, b) => a.performed_on.localeCompare(b.performed_on) || a.id - b.id);

  const host = h('div', { class: 'chart-svg', dir: 'ltr' });
  const caption = h('p', { class: 'chart-caption' });
  const buttons = metrics.map((m) =>
    h('button', {
      type: 'button',
      class: 'seg',
      onclick: () => { metric = m; selected = null; draw(true); },
    }, t(m.label)),
  );
  const toggles = metrics.length > 1 ? h('div', { class: 'seg-group compact' }, buttons) : null;
  const hint = h('p', { class: 'chart-hint', hidden: true }, t('chart_lower_better'));
  const box = h('div', { class: 'chart' }, toggles, hint, host, caption);

  function showCaption(r) {
    caption.replaceChildren(
      // date and value are isolated separately: a Hebrew month name would otherwise reorder the numbers after it
      h('span', {}, h('bdi', {}, fmtDate(r.performed_on)), ' · ', h('bdi', { dir: 'ltr' }, valueText(r))),
      h('span', { class: 'legend' }, h('i', { class: 'legend-dot' }), t('chart_legend')),
    );
  }

  function draw(force = false) {
    const width = Math.floor(host.clientWidth);
    if (width < 80 || (width === drawnWidth && !force)) return; // hidden panel, or nothing changed
    drawnWidth = width;
    hint.hidden = !metric.lowerBetter;
    buttons.forEach((b, i) => {
      b.classList.toggle('on', metrics[i] === metric);
      b.setAttribute('aria-pressed', String(metrics[i] === metric));
    });

    const points = ordered.map((r) => ({ r, v: metric.get(r) })).filter((p) => p.v != null);
    if (!points.length) {
      host.replaceChildren();
      return;
    }
    const values = points.map((p) => p.v);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const pad = hi === lo ? Math.max(1, hi * 0.05) : (hi - lo) * 0.14;
    lo = Math.max(0, lo - pad);
    hi += pad;
    const step = niceStep((hi - lo) / 4);
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

    const times = points.map((p) => dayMs(p.r.performed_on));
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const X = (ms) => (t1 === t0 ? PAD.left + plotW / 2 : PAD.left + ((ms - t0) / (t1 - t0)) * plotW);
    const share = (v) => (v - lo) / (hi - lo);
    const Y = (v) => PAD.top + (metric.lowerBetter ? share(v) : 1 - share(v)) * plotH; // small time = high up
    const xy = points.map((p, i) => [X(times[i]), Y(p.v)]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${PAD.top + plotH} L${xy[0][0].toFixed(1)} ${PAD.top + plotH} Z`;

    const years = new Set([ordered[0].performed_on.slice(0, 4), ordered[ordered.length - 1].performed_on.slice(0, 4)]);
    const withYear = years.size > 1;
    const first = ordered[0].performed_on;
    const last = ordered[ordered.length - 1].performed_on;

    const dots = points.map((p, i) => {
      const cls = ['chart-dot', p.r.is_pr || p.r.is_current_pr ? 'pr' : '', p.r.is_current_pr ? 'now' : '', p.r === selected ? 'sel' : '']
        .filter(Boolean).join(' ');
      const pick = () => {
        selected = p.r;
        showCaption(p.r);
        host.querySelectorAll('.chart-dot').forEach((d) => d.classList.remove('sel'));
        dot.classList.add('sel');
      };
      const dot = s('circle', {
        class: cls, cx: xy[i][0], cy: xy[i][1], r: p.r.is_current_pr ? 7 : p.r.is_pr ? 5.5 : 4,
        tabindex: 0, role: 'button', 'aria-label': `${fmtDate(p.r.performed_on)} ${valueText(p.r)}`,
        onclick: pick,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } },
      });
      return dot;
    });

    host.replaceChildren(
      s('svg', { class: 'chart-canvas', width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, role: 'img', 'aria-label': t('chart_label') },
        ticks.map((v) => s('g', {},
          s('line', { class: 'chart-grid', x1: PAD.left, x2: width - PAD.right, y1: Y(v), y2: Y(v) }),
          s('text', { class: 'chart-tick', x: PAD.left - 8, y: Y(v) + 4, 'text-anchor': 'end' }, metric.fmt(v)),
        )),
        s('path', { class: 'chart-area', d: area }),
        s('path', { class: 'chart-line', d: line }),
        dots,
        s('text', { class: 'chart-tick', x: t1 === t0 ? width / 2 : PAD.left, y: HEIGHT - 6, 'text-anchor': t1 === t0 ? 'middle' : 'start' }, fmtDate(first, withYear)),
        t1 === t0 ? null : s('text', { class: 'chart-tick', x: width - PAD.right, y: HEIGHT - 6, 'text-anchor': 'end' }, fmtDate(last, withYear)),
      ),
    );
    showCaption(selected ?? ordered.find((r) => r.is_current_pr) ?? ordered[ordered.length - 1]);
  }

  // The caller calls box.redraw() right after showing the panel; the observer then keeps it
  // correct whenever the width changes (phone rotation, window resize).
  box.redraw = () => draw();
  new ResizeObserver(() => draw()).observe(host);
  return box;
}
