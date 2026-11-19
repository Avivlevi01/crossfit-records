// CrossFit Records front-end: plain JavaScript, no framework.
// Safety rule used everywhere: user-provided text is only ever inserted as TEXT
// (via h() / textContent), never as HTML, so nobody can inject scripts.

import { t, getLang, setLang, applyDocLang, categoryName, entriesText } from './i18n.js';
import { h, icon, appendKids } from './dom.js';
import { fmtNum, fmtDate, fmtDateTime, unit, valueText, valueTextFor, improvementText, paceText } from './format.js';
import { progressChart } from './chart.js';
import { celebratePR } from './celebrate.js';

const $ = (sel) => document.querySelector(sel);
const CATEGORY_ORDER = ['Strength', 'Olympic lifts', 'Gymnastics', 'Benchmark WODs', 'Endurance', 'Hyrox', 'Custom'];
const KINDS = ['weight_reps', 'reps_only', 'time', 'distance_time'];

let me = null; // the logged-in user {id, username}
let exercises = []; // all exercises (default + custom)
let mineFilter = ''; // selected exercise filter on "my records"
let renderToken = 0; // lets slow requests notice the user already navigated away

function setContent(...nodes) {
  const app = $('#app');
  app.replaceChildren();
  appendKids(app, nodes);
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- API ----------

class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, null);
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) sessionLost();
    throw new ApiError(res.status, data?.detail);
  }
  return data;
}

function errorText(e, context = '') {
  if (!(e instanceof ApiError) || e.status === 0) return t('err_network');
  switch (e.status) {
    case 401:
      return context === 'auth' ? t('err_login') : t('err_session');
    case 403:
      return context === 'auth' ? t('err_invite') : t('err_forbidden');
    case 409:
      return context === 'auth' ? t('err_taken') : typeof e.detail === 'string' ? e.detail : t('err_generic');
    case 422:
      return typeof e.detail === 'string' ? `${t('err_validation')}: ${e.detail}` : t('err_validation');
    case 429:
      return t('err_rate');
    default:
      return t('err_generic');
  }
}

function sessionLost() {
  if (!me) return;
  me = null;
  route();
  toast(t('err_session'));
}

const todayISO = () => new Date().toLocaleDateString('sv-SE'); // yyyy-mm-dd in local time
const exerciseById = (id) => exercises.find((e) => e.id === id);

function sortedCategories() {
  const present = [...new Set(exercises.map((e) => e.category))];
  const rank = (c) => (CATEGORY_ORDER.includes(c) ? CATEGORY_ORDER.indexOf(c) : CATEGORY_ORDER.length);
  return present.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// ---------- page chrome (top bar, tabs) ----------

function updateChrome() {
  $('#langBtn').textContent = t('lang_switch');
  $('#logoutBtn').textContent = t('logout');
  $('#logoutBtn').hidden = !me;
  $('#brand').hidden = !me;
  $('#tabbar').hidden = !me;
  $('#tabMe').textContent = t('nav_mine');
  $('#tabBoard').textContent = t('nav_board');
  $('#tabFriends').textContent = t('nav_friends');
  const hash = location.hash || '#/me';
  const onBoard = hash.startsWith('#/board');
  const onFriends = hash.startsWith('#/friends') || hash.startsWith('#/u/');
  for (const [el, active] of [
    [$('#tabMe'), !onBoard && !onFriends],
    [$('#tabBoard'), onBoard],
    [$('#tabFriends'), onFriends],
  ]) {
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
  document.body.classList.toggle('logged-out', !me);
}

function bindChrome() {
  $('#langBtn').addEventListener('click', () => {
    setLang(getLang() === 'he' ? 'en' : 'he');
    route();
  });
  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* cookie is cleared server-side; either way show the login screen */
    }
    me = null;
    exercises = [];
    location.hash = '';
    route();
  });
  const dlg = $('#recordDialog');
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close(); // click on the dimmed backdrop
  });
}

// ---------- login / register ----------

function viewAuth(notice = '') {
  let mode = 'login';
  const card = h('section', { class: 'auth-card' });

  function draw() {
    const isReg = mode === 'register';
    const err = h('p', { class: 'form-error', role: 'alert' }, notice);
    notice = '';
    const username = h('input', {
      id: 'a-user', name: 'username', autocomplete: 'username', required: true,
      maxlength: 32, autocapitalize: 'none', spellcheck: 'false',
    });
    const password = h('input', {
      id: 'a-pass', name: 'password', type: 'password', required: true, maxlength: 128,
      minlength: isReg ? 8 : null, autocomplete: isReg ? 'new-password' : 'current-password',
    });
    const invite = h('input', { id: 'a-invite', name: 'invite', required: true, maxlength: 100, autocomplete: 'off' });
    const submit = h('button', { class: 'btn primary wide', type: 'submit' }, isReg ? t('submit_register') : t('submit_login'));

    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          submit.disabled = true;
          try {
            const path = isReg ? '/api/auth/register' : '/api/auth/login';
            const body = { username: username.value.trim(), password: password.value };
            if (isReg) body.invite_code = invite.value.trim();
            me = await api(path, { method: 'POST', body });
            exercises = await api('/api/exercises');
            location.hash = '#/me';
            route();
          } catch (ex) {
            me = null;
            err.textContent = errorText(ex, 'auth');
            submit.disabled = false;
          }
        },
      },
      field('a-user', t('username'), username, isReg ? t('username_hint') : ''),
      field('a-pass', t('password'), password, isReg ? t('password_hint') : ''),
      isReg ? field('a-invite', t('invite'), invite, t('invite_hint')) : null,
      err,
      submit,
    );

    const tab = (m, label) =>
      h('button', {
        type: 'button', class: `seg${mode === m ? ' on' : ''}`, 'aria-pressed': String(mode === m),
        onclick: () => { mode = m; draw(); },
      }, label);

    card.replaceChildren(h('div', { class: 'seg-group' }, tab('login', t('login')), tab('register', t('register'))), form);
    username.focus({ preventScroll: true });
  }

  draw();
  setContent(
    h('div', { class: 'auth-hero' },
      h('img', { src: 'logo.svg', alt: '', width: 132, height: 132 }),
      h('h1', { class: 'display' }, 'CROSSFIT ', h('b', {}, 'RECORDS')),
      h('p', { class: 'tagline' }, t('tagline')),
    ),
    card,
  );
}

function field(id, label, input, hint = '') {
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    input,
    hint ? h('small', { class: 'hint' }, hint) : null,
  );
}

// ---------- records list (shared by "mine" and a friend's page) ----------

function groupByExercise(records) {
  const groups = new Map();
  for (const r of records) {
    if (!groups.has(r.exercise.id)) groups.set(r.exercise.id, { exercise: r.exercise, items: [] });
    groups.get(r.exercise.id).items.push(r);
  }
  return [...groups.values()];
}

function recordGroups(records, { editable, onChange }) {
  let n = 0;
  return groupByExercise(records).map((g) => {
    const best = g.items.find((r) => r.is_current_pr);
    const best1rm = Math.max(0, ...g.items.map((r) => r.est_1rm ?? 0));
    const chartPanel = h('div', { class: 'chart-panel', hidden: true });
    const chartBtn = h('button', {
      type: 'button', class: 'link-btn chart-btn', 'aria-expanded': 'false',
      onclick: () => {
        const open = chartPanel.hidden;
        if (open && !chartPanel.firstChild) chartPanel.append(progressChart(g.items, g.exercise.kind));
        chartPanel.hidden = !open;
        chartBtn.setAttribute('aria-expanded', String(open));
        if (open) chartPanel.firstChild.redraw(); // draw now that the panel has a width
      },
    }, icon('chart'), t('chart'));

    return h('section', { class: 'group' },
      h('header', { class: 'group-head' },
        h('h3', { class: 'display' }, g.exercise.name),
        h('span', { class: 'tag' }, categoryName(g.exercise.category)),
        h('span', { class: 'count' }, entriesText(g.items.length)),
      ),
      g.exercise.description ? h('p', { class: 'ex-desc inset', dir: 'auto' }, g.exercise.description) : null,
      h('div', { class: 'group-summary' },
        best ? h('span', { class: 'sum pr' }, icon('trophy'), h('b', {}, t('pr_current')), h('span', { dir: 'ltr' }, valueText(best))) : null,
        best1rm ? h('span', { class: 'sum' }, h('b', {}, t('est_1rm')), h('span', { dir: 'ltr' }, `≈ ${fmtNum(best1rm)} ${unit(t('kg'))}`)) : null,
        g.items.length > 1 ? chartBtn : null,
      ),
      chartPanel,
      h('ul', { class: 'entries' }, g.items.map((r) => entryRow(r, { editable, onChange, index: n++ }))),
    );
  });
}

function entryRow(rec, { editable, onChange, index }) {
  const countNum = h('span', { class: 'num' }, String(rec.comment_count));
  const panel = h('div', { class: 'comments', hidden: true });
  const commentBtn = h('button', {
    type: 'button', class: 'icon-btn', 'aria-expanded': 'false', 'aria-label': t('comments'),
    onclick: () => {
      const open = panel.hidden;
      panel.hidden = !open;
      commentBtn.setAttribute('aria-expanded', String(open));
      if (open) loadComments(rec, panel, countNum);
    },
  }, icon('comment'), countNum);

  const actions = [commentBtn];
  if (editable) {
    actions.push(
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': t('edit'),
        onclick: () => openRecordDialog(rec, onChange),
      }, icon('edit')),
      h('button', {
        type: 'button', class: 'icon-btn danger', 'aria-label': t('delete'),
        onclick: async () => {
          if (!confirm(t('confirm_delete'))) return;
          try {
            await api(`/api/records/${rec.id}`, { method: 'DELETE' });
            toast(t('deleted'));
            onChange();
          } catch (e) {
            toast(errorText(e));
          }
        },
      }, icon('trash')),
    );
  }

  const li = h('li', { class: 'entry' },
    h('div', { class: 'entry-main' },
      h('div', { class: 'entry-top' },
        h('div', { class: 'entry-value', dir: 'ltr' }, valueText(rec)),
        rec.is_current_pr ? h('span', { class: 'pr-badge' }, icon('trophy'), t('pr')) : null,
      ),
      h('div', { class: 'entry-meta' },
        h('span', {}, fmtDate(rec.performed_on)),
        rec.est_1rm ? h('span', { class: 'est', dir: 'ltr' }, `1RM≈${fmtNum(rec.est_1rm)}`) : null,
        rec.exercise.kind === 'distance_time' ? h('span', { class: 'est', dir: 'ltr' }, paceText(rec)) : null,
        rec.note ? h('span', { class: 'note' }, rec.note) : null,
      ),
    ),
    h('div', { class: 'entry-actions' }, actions),
    panel,
  );
  li.style.animationDelay = `${Math.min(index, 12) * 35}ms`;
  return li;
}

async function loadComments(rec, panel, countNum) {
  const list = h('ul', { class: 'comment-list' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const input = h('input', { maxlength: 500, placeholder: t('comment_placeholder'), 'aria-label': t('comment_placeholder'), required: true });
  const send = h('button', { class: 'btn small', type: 'submit' }, t('send'));
  const form = h('form', {
    class: 'comment-form',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      send.disabled = true;
      try {
        await api(`/api/records/${rec.id}/comments`, { method: 'POST', body: { body: input.value } });
        input.value = '';
        await refresh();
      } catch (ex) {
        err.textContent = errorText(ex);
      }
      send.disabled = false;
    },
  }, input, send);

  async function refresh() {
    const comments = await api(`/api/records/${rec.id}/comments`);
    countNum.textContent = String(comments.length);
    list.replaceChildren(
      ...(comments.length
        ? comments.map((c) =>
            h('li', { class: 'comment' },
              h('div', { class: 'comment-head' },
                h('strong', {}, c.author_username),
                h('time', { datetime: c.created_at }, fmtDateTime(c.created_at)),
                c.can_delete
                  ? h('button', {
                      type: 'button', class: 'icon-btn danger tiny', 'aria-label': t('delete'),
                      onclick: async () => {
                        if (!confirm(t('confirm_delete_comment'))) return;
                        try {
                          await api(`/api/comments/${c.id}`, { method: 'DELETE' });
                          await refresh();
                        } catch (ex) {
                          err.textContent = errorText(ex);
                        }
                      },
                    }, icon('close'))
                  : null,
              ),
              h('p', {}, c.body),
            ),
          )
        : [h('li', { class: 'empty small' }, t('no_comments'))]),
    );
  }

  panel.replaceChildren(list, err, form);
  try {
    await refresh();
  } catch (ex) {
    err.textContent = errorText(ex);
  }
}

// ---------- "my records" ----------

async function viewMine() {
  const token = ++renderToken;
  setContent(h('p', { class: 'loading' }, t('loading')));
  let records;
  try {
    records = await api(`/api/users/${me.id}/records`);
  } catch (e) {
    if (token === renderToken && me) setContent(h('p', { class: 'form-error' }, errorText(e)));
    return;
  }
  if (token !== renderToken) return;

  if (mineFilter && !records.some((r) => String(r.exercise.id) === mineFilter)) mineFilter = '';
  const listBox = h('div', { class: 'groups' });
  const used = groupByExercise(records).map((g) => g.exercise);

  const filter = h('select', {
    'aria-label': t('filter_all'),
    value: mineFilter,
    onchange: () => { mineFilter = filter.value; drawList(); },
  }, h('option', { value: '' }, t('filter_all')), used.map((ex) => h('option', { value: String(ex.id) }, ex.name)));
  filter.value = mineFilter;

  function drawList() {
    const shown = mineFilter ? records.filter((r) => String(r.exercise.id) === mineFilter) : records;
    listBox.replaceChildren(
      ...(shown.length
        ? recordGroups(shown, { editable: true, onChange: viewMine })
        : [h('p', { class: 'empty' }, t('empty_mine'))]),
    );
  }
  drawList();

  setContent(
    h('div', { class: 'page-head' },
      h('h2', { class: 'display' }, t('mine_title')),
      h('button', { type: 'button', class: 'btn primary', onclick: () => openRecordDialog(null, viewMine) }, icon('plus'), t('new_record')),
    ),
    records.length ? h('div', { class: 'toolbar' }, filter) : null,
    listBox,
  );
}

// ---------- leaderboard ----------

/** Banner above the ranking: where I stand and how far the next place is. */
function myPositionBanner(entries, kind, exercise, reload) {
  const mine = entries.findIndex((e) => e.user_id === me.id);
  if (mine === -1) {
    return h('div', { class: 'board-banner' },
      h('span', {}, t('board_not_in')),
      h('button', { type: 'button', class: 'btn small primary', onclick: () => openRecordDialog(null, reload, exercise.id) }, icon('plus'), t('board_add')),
    );
  }
  const me_ = entries[mine];
  const parts = [h('strong', { class: 'display' }, t('board_rank', { rank: me_.rank, total: entries.length }))];
  if (me_.rank === 1) {
    const sharing = entries.filter((e) => e.rank === 1).length > 1;
    parts.push(h('span', {}, t(sharing ? 'board_tied_lead' : 'board_leader')));
  } else {
    // the closest person ahead of me (skipping anyone tied with me)
    let above = mine - 1;
    while (entries[above].rank === me_.rank) above--;
    const ahead = entries[above];
    parts.push(h('span', {}, t('board_gap', { name: ahead.username, gap: '' }), h('bdi', { dir: 'ltr' }, improvementText(kind, ahead, me_))));
  }
  return h('div', { class: `board-banner${me_.rank === 1 ? ' lead' : ''}` }, icon('trophy'), h('div', { class: 'banner-text' }, parts));
}

function boardRow(e, kind, index) {
  const isMe = e.user_id === me.id;
  const row = h('li', { class: `board-row${isMe ? ' me' : ''}${e.rank <= 3 ? ` top${e.rank}` : ''}` },
    h('a', { href: isMe ? '#/me' : `#/u/${e.user_id}` },
      h('span', { class: 'rank' }, String(e.rank)),
      h('span', { class: 'board-who' },
        h('strong', {}, e.username, isMe ? h('span', { class: 'you' }, ` ${t('you')}`) : null),
        h('small', {}, fmtDate(e.performed_on)),
      ),
      h('span', { class: 'board-score' },
        h('span', { class: 'board-val display', dir: 'ltr' }, valueTextFor(kind, e)),
        e.est_1rm ? h('small', { class: 'est', dir: 'ltr' }, `1RM≈${fmtNum(e.est_1rm)}`) : null,
      ),
    ),
  );
  row.style.animationDelay = `${Math.min(index, 12) * 40}ms`;
  return row;
}

async function viewBoard(requestedId) {
  const token = ++renderToken;
  setContent(h('p', { class: 'loading' }, t('loading')));
  let overview, board;
  try {
    overview = await api('/api/leaderboard');
    const id = overview.some((o) => o.exercise.id === requestedId) ? requestedId : overview[0]?.exercise.id;
    if (id) board = await api(`/api/leaderboard/${id}`);
  } catch (e) {
    if (token === renderToken && me) setContent(h('p', { class: 'form-error' }, errorText(e)));
    return;
  }
  if (token !== renderToken) return;

  const title = h('div', { class: 'page-head' }, h('h2', { class: 'display' }, t('board_title')));
  if (!board) {
    setContent(title, h('p', { class: 'empty' }, t('board_empty')));
    return;
  }
  const { exercise, entries } = board;
  const reload = () => viewBoard(exercise.id);

  const pick = h('select', {
    id: 'board-ex', 'aria-label': t('board_pick'),
    onchange: () => { location.hash = `#/board/${pick.value}`; },
  }, overview.map((o) => h('option', { value: String(o.exercise.id) }, `${o.exercise.name} (${o.participants})`)));
  pick.value = String(exercise.id);

  setContent(
    title,
    h('div', { class: 'toolbar' }, pick),
    exercise.description ? h('p', { class: 'ex-desc', dir: 'auto' }, exercise.description) : null,
    myPositionBanner(entries, exercise.kind, exercise, reload),
    h('ol', { class: 'board' }, entries.map((e, i) => boardRow(e, exercise.kind, i))),
  );
}

// ---------- friends ----------

async function viewFriends() {
  const token = ++renderToken;
  setContent(h('p', { class: 'loading' }, t('loading')));
  let users;
  try {
    users = await api('/api/users');
  } catch (e) {
    if (token === renderToken && me) setContent(h('p', { class: 'form-error' }, errorText(e)));
    return;
  }
  if (token !== renderToken) return;

  setContent(
    h('div', { class: 'page-head' }, h('h2', { class: 'display' }, t('friends_title'))),
    h('ul', { class: 'friends' },
      users.map((u, i) => {
        const card = h('li', { class: 'friend' },
          h('a', { href: u.id === me.id ? '#/me' : `#/u/${u.id}` },
            h('span', { class: 'avatar', 'aria-hidden': 'true' }, [...u.username][0].toUpperCase()),
            h('span', { class: 'friend-info' },
              h('strong', {}, u.username, u.id === me.id ? h('span', { class: 'you' }, ` ${t('you')}`) : null),
              h('small', {},
                entriesText(u.record_count),
                u.last_record_on ? ` · ${t('last_entry', { date: fmtDate(u.last_record_on) })}` : '',
              ),
            ),
          ),
        );
        card.style.animationDelay = `${Math.min(i, 12) * 35}ms`;
        return card;
      }),
    ),
  );
}

async function viewUser(userId) {
  if (userId === me.id) {
    location.hash = '#/me';
    return;
  }
  const token = ++renderToken;
  setContent(h('p', { class: 'loading' }, t('loading')));
  let records, users;
  try {
    [records, users] = await Promise.all([api(`/api/users/${userId}/records`), api('/api/users')]);
  } catch (e) {
    if (token === renderToken && me) {
      setContent(h('a', { class: 'back', href: '#/friends' }, icon('back'), t('back')), h('p', { class: 'form-error' }, errorText(e)));
    }
    return;
  }
  if (token !== renderToken) return;
  const owner = users.find((u) => u.id === userId);
  if (!owner) {
    location.hash = '#/friends';
    return;
  }

  setContent(
    h('a', { class: 'back', href: '#/friends' }, icon('back'), t('back')),
    h('div', { class: 'page-head' },
      h('h2', { class: 'display' }, t('records_of', { name: owner.username })),
      h('span', { class: 'tag' }, t('read_only')),
    ),
    h('div', { class: 'groups' },
      records.length
        ? recordGroups(records, { editable: false, onChange: () => {} })
        : h('p', { class: 'empty' }, t('empty_other')),
    ),
  );
}

// ---------- add / edit record dialog ----------

function openRecordDialog(rec, onSaved, presetExerciseId = null) {
  const dlg = $('#recordDialog');
  const secs = rec?.time_seconds;
  const longRun = rec?.distance_m >= 1000;
  const vals = {
    weight: rec?.weight_kg != null ? fmtNum(rec.weight_kg) : '',
    reps: rec?.reps != null ? String(rec.reps) : '',
    min: secs != null ? String(Math.floor(secs / 60)) : '',
    sec: secs != null ? String(+(secs % 60).toFixed(2)) : '',
    distance: rec?.distance_m != null ? String(longRun ? +(rec.distance_m / 1000).toFixed(3) : rec.distance_m) : '',
    distUnit: rec && !longRun ? 'm' : 'km', // runs are usually thought of in km
    date: rec?.performed_on ?? todayISO(),
    note: rec?.note ?? '',
  };
  let exId = rec ? rec.exercise.id : presetExerciseId || Number(mineFilter) || exercises[0]?.id;

  const err = h('p', { class: 'form-error', role: 'alert' });
  const exDesc = h('p', { class: 'ex-desc', dir: 'auto' }); // e.g. what Fran consists of
  const select = h('select', { id: 'f-ex', onchange: () => { exId = Number(select.value); drawFields(); } });
  function fillSelect() {
    select.replaceChildren(
      ...sortedCategories().map((cat) =>
        h('optgroup', { label: categoryName(cat) },
          exercises.filter((e) => e.category === cat).map((e) => h('option', { value: String(e.id) }, e.name)),
        ),
      ),
    );
    select.value = String(exId);
  }
  fillSelect();

  const fields = h('div', { class: 'fields' });
  function numberField(id, key, label, props) {
    const input = h('input', { id, value: vals[key], oninput: () => { vals[key] = input.value; }, ...props });
    return field(id, label, input);
  }
  // Minutes and seconds are two plain number boxes: phone number pads have no ":" key.
  function timeField() {
    const min = h('input', {
      id: 'f-min', type: 'number', inputmode: 'numeric', min: 0, max: 999, step: 1,
      placeholder: t('min_short'), 'aria-label': t('minutes'), value: vals.min,
      oninput: () => { vals.min = min.value; },
    });
    const sec = h('input', {
      id: 'f-sec', inputmode: 'decimal', autocomplete: 'off',
      placeholder: t('sec_short'), 'aria-label': t('seconds'), value: vals.sec,
      oninput: () => { vals.sec = sec.value; },
    });
    return h('div', { class: 'field' },
      h('label', { for: 'f-min' }, t('time')),
      h('div', { class: 'time-inputs', dir: 'ltr' }, min, h('span', { class: 'colon', 'aria-hidden': 'true' }, ':'), sec),
    );
  }

  function distanceField() {
    const dist = h('input', {
      id: 'f-dist', inputmode: 'decimal', autocomplete: 'off', required: true, value: vals.distance,
      oninput: () => { vals.distance = dist.value; },
    });
    const unitSel = h('select', {
      id: 'f-dunit', 'aria-label': t('unit_label'), value: vals.distUnit,
      onchange: () => { vals.distUnit = unitSel.value; },
    }, h('option', { value: 'km' }, t('km')), h('option', { value: 'm' }, t('meters')));
    return h('div', { class: 'field' },
      h('label', { for: 'f-dist' }, t('distance')),
      h('div', { class: 'dist-row' }, dist, unitSel),
    );
  }

  function drawFields() {
    const exercise = exerciseById(exId);
    const kind = exercise.kind;
    exDesc.textContent = exercise.description ?? '';
    exDesc.hidden = !exercise.description;
    const parts = [];
    if (kind === 'weight_reps') {
      parts.push(numberField('f-weight', 'weight', t('weight'), { inputmode: 'decimal', autocomplete: 'off', required: true }));
    }
    if (kind === 'weight_reps' || kind === 'reps_only') {
      parts.push(numberField('f-reps', 'reps', t('reps'), { type: 'number', inputmode: 'numeric', min: 1, step: 1, required: true }));
    }
    if (kind === 'distance_time') parts.push(distanceField());
    if (kind === 'time' || kind === 'distance_time') parts.push(timeField());
    fields.replaceChildren(...parts);
  }
  drawFields();

  // "my own exercise" mini form
  const newName = h('input', {
    id: 'x-name', maxlength: 60, autocomplete: 'off',
    onkeydown: (e) => {
      if (e.key === 'Enter') { // Enter here adds the exercise, it must not submit the whole record form
        e.preventDefault();
        addExerciseBtn.click();
      }
    },
  });
  const newKind = h('select', { id: 'x-kind' }, KINDS.map((k) => h('option', { value: k }, t(`kind_${k}`))));
  const newDesc = h('input', { id: 'x-desc', maxlength: 200, autocomplete: 'off' });
  const newErr = h('p', { class: 'form-error', role: 'alert' });
  const addExerciseBtn = h('button', {
      type: 'button', class: 'btn small',
      onclick: async () => {
        newErr.textContent = '';
        try {
          const made = await api('/api/exercises', {
            method: 'POST',
            body: { name: newName.value, kind: newKind.value, category: 'Custom', description: newDesc.value.trim() || null },
          });
          exercises.push(made);
          exId = made.id;
          fillSelect();
          drawFields();
          newName.value = '';
          newDesc.value = '';
          newBox.hidden = true;
          toast(t('ex_added'));
        } catch (ex) {
          newErr.textContent = errorText(ex);
        }
      },
    }, t('ex_create'));
  const newBox = h('div', { class: 'subform', hidden: true },
    field('x-name', t('ex_name'), newName),
    field('x-kind', t('ex_kind'), newKind),
    field('x-desc', t('ex_desc'), newDesc),
    newErr,
    addExerciseBtn,
  );
  const toggleNew = h('button', {
    type: 'button', class: 'link-btn',
    onclick: () => { newBox.hidden = !newBox.hidden; if (!newBox.hidden) newName.focus(); },
  }, icon('plus'), t('add_exercise'));

  const date = h('input', { id: 'f-date', type: 'date', required: true, max: todayISO(), value: vals.date, oninput: () => { vals.date = date.value; } });
  const note = h('textarea', { id: 'f-note', maxlength: 500, rows: 2, oninput: () => { vals.note = note.value; } });
  note.value = vals.note;
  const save = h('button', { class: 'btn primary', type: 'submit' }, t('save'));

  const form = h('form', {
    class: 'sheet stack',
    method: 'dialog',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const kind = exerciseById(exId).kind;
      const body = { exercise_id: exId, performed_on: vals.date, note: vals.note.trim() || null };
      if (kind === 'weight_reps') body.weight_kg = Number(vals.weight.replace(',', '.'));
      if (kind === 'weight_reps' || kind === 'reps_only') body.reps = Number(vals.reps);
      if (kind === 'distance_time') {
        body.distance_m = Math.round(Number(vals.distance.replace(',', '.')) * (vals.distUnit === 'km' ? 1000 : 1));
      }
      if (kind === 'time' || kind === 'distance_time') {
        const mins = Number(vals.min || 0);
        const secs = Number((vals.sec || '0').replace(',', '.'));
        // minutes may exceed 59 (long WODs); seconds must be 0-59.99
        body.time_seconds = mins >= 0 && secs >= 0 && secs < 60 ? mins * 60 + secs : NaN;
        if (!(body.time_seconds > 0)) body.time_seconds = NaN;
      }
      if (Object.values(body).some((v) => typeof v === 'number' && !Number.isFinite(v))) {
        err.textContent = t('err_validation');
        return;
      }
      save.disabled = true;
      try {
        const saved = await api(rec ? `/api/records/${rec.id}` : '/api/records', { method: rec ? 'PUT' : 'POST', body });
        dlg.close();
        onSaved();
        if (saved.celebration?.type === 'new') celebratePR(saved); // broke a PR: the big show
        else if (saved.celebration?.type === 'first') toast(t('pr_first')); // first record: baseline
        else toast(t('saved'));
      } catch (ex) {
        err.textContent = errorText(ex);
      }
      save.disabled = false;
    },
  },
    h('h2', { class: 'display' }, rec ? t('rec_edit') : t('rec_new')),
    field('f-ex', t('exercise'), select),
    exDesc,
    toggleNew,
    newBox,
    fields,
    field('f-date', t('date'), date),
    field('f-note', t('note'), note),
    err,
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, t('cancel')),
      save,
    ),
  );

  dlg.replaceChildren(form);
  dlg.showModal();
}

// ---------- router ----------

function route() {
  updateChrome();
  if (!me) {
    renderToken++;
    viewAuth();
    return;
  }
  const hash = location.hash || '#/me';
  const user = hash.match(/^#\/u\/(\d+)$/);
  const board = hash.match(/^#\/board(?:\/(\d+))?$/);
  if (hash === '#/me') viewMine();
  else if (board) viewBoard(board[1] ? Number(board[1]) : null);
  else if (hash === '#/friends') viewFriends();
  else if (user) viewUser(Number(user[1]));
  else location.hash = '#/me';
}

async function boot() {
  applyDocLang();
  bindChrome();
  window.addEventListener('hashchange', route);
  try {
    me = await api('/api/auth/me');
    exercises = await api('/api/exercises');
  } catch {
    me = null;
  }
  route();
}

boot();
