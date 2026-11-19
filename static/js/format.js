// Turning numbers, times, dates and records into display text.

import { getLang, t } from './i18n.js';

export const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

export function fmtTime(seconds) {
  const total = Math.round(seconds * 100) / 100;
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const secStr = Number.isInteger(secs) ? String(secs).padStart(2, '0') : secs.toFixed(2).padStart(5, '0');
  return hrs ? `${hrs}:${String(mins).padStart(2, '0')}:${secStr}` : `${mins}:${secStr}`;
}

/** "4:35" -> 275, "1:02:03" -> 3723, "95" -> 95. Returns NaN if it isn't a time. */
export function parseTime(text) {
  const parts = text.trim().replace(',', '.').split(':');
  if (!text.trim() || parts.length > 3) return NaN;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+(\.\d+)?$/.test(p)) return NaN;
    total = total * 60 + parseFloat(p);
  }
  return total;
}

const locale = () => (getLang() === 'he' ? 'he-IL' : 'en-GB');

export function fmtDate(iso, withYear = true) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(locale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Wraps a (possibly Hebrew) unit word in an invisible "isolate" so it can't reorder the
// numbers around it when a left-to-right line like "102.5 kg × 3" is shown on a Hebrew page.
export const unit = (s) => `⁦${s}⁩`;

/** Display text for a set of values; `v` has weight_kg, reps, time_seconds, distance_m. */
export function valueTextFor(kind, v) {
  switch (kind) {
    case 'weight_reps':
      return `${fmtNum(v.weight_kg)} ${unit(t('kg'))} × ${v.reps}`;
    case 'reps_only':
      return `${v.reps} ${unit(t('reps_word'))}`;
    case 'time':
      return fmtTime(v.time_seconds);
    case 'distance_time':
      return `${fmtNum(v.distance_m)} ${unit(t('meters'))} · ${fmtTime(v.time_seconds)}`;
    default:
      return '';
  }
}

export const valueText = (rec) => valueTextFor(rec.exercise.kind, rec);

/**
 * How much better `now` is than `prev` ("+2.5 kg", "+2 reps", "0:12 faster").
 * Used for "you beat your old PR by..." and "you are X behind the next place".
 */
export function improvementText(kind, now, prev) {
  if (!prev) return '';
  const plus = (n, word) => `+${fmtNum(+n.toFixed(2))} ${unit(word)}`;
  const faster = () => t('delta_faster', { time: fmtTime(prev.time_seconds - now.time_seconds) });
  switch (kind) {
    case 'weight_reps':
      return now.weight_kg > prev.weight_kg
        ? plus(now.weight_kg - prev.weight_kg, t('kg'))
        : plus(now.reps - prev.reps, t('reps_word'));
    case 'reps_only':
      return plus(now.reps - prev.reps, t('reps_word'));
    case 'distance_time':
      // farther wins; at the same distance the faster time wins
      return now.distance_m > prev.distance_m ? plus(now.distance_m - prev.distance_m, t('meters')) : faster();
    case 'time':
      return faster();
    default:
      return '';
  }
}
