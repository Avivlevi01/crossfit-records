// CrossFit Records front-end: plain JavaScript, no framework.
// Safety rule used everywhere: user-provided text is only ever inserted as TEXT
// (via h() / textContent), never as HTML, so nobody can inject scripts.

import { t, getLang, setLang, applyDocLang, categoryName, entriesText } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const CATEGORY_ORDER = ['Strength', 'Olympic lifts', 'Gymnastics', 'Benchmark WODs', 'Endurance', 'Hyrox', 'Custom'];
const KINDS = ['weight_reps', 'reps_only', 'time', 'distance_time'];

let me = null; // the logged-in user {id, username}
let exercises = []; // all exercises (default + custom)
let mineFilter = ''; // selected exercise filter on "my records"
let renderToken = 0; // lets slow requests notice the user already navigated away

// ---------- tiny DOM helpers ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  edit: '<path d="M4 20h4L18.5 9.5l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
  comment: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name]; // fixed trusted strings above, never user data
  return svg;
}

function appendKids(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendKids(el, kids);
  if (value !== undefined) el.value = value; // after children, so <select> options exist
  return el;
}

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

// ---------- formatting ----------

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

function fmtTime(seconds) {
  const total = Math.round(seconds * 100) / 100;
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const secStr = Number.isInteger(secs) ? String(secs).padStart(2, '0') : secs.toFixed(2).padStart(5, '0');
  return hrs ? `${hrs}:${String(mins).padStart(2, '0')}:${secStr}` : `${mins}:${secStr}`;
}

/** "4:35" -> 275, "1:02:03" -> 3723, "95" -> 95. Returns NaN if it isn't a time. */
function parseTime(text) {
  const parts = text.trim().replace(',', '.').split(':');
  if (!text.trim() || parts.length > 3) return NaN;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+(\.\d+)?$/.test(p)) return NaN;
    total = total * 60 + parseFloat(p);
  }
  return total;
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getLang() === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(getLang() === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Wraps a (possibly Hebrew) unit word in an invisible "isolate" so it can't reorder the
// numbers around it when a left-to-right line like "102.5 kg × 3" is shown on a Hebrew page.
const unit = (s) => `⁦${s}⁩`;

function valueText(rec) {
  switch (rec.exercise.kind) {
    case 'weight_reps':
      return `${fmtNum(rec.weight_kg)} ${unit(t('kg'))} × ${rec.reps}`;
    case 'reps_only':
      return `${rec.reps} ${unit(t('reps_word'))}`;
    case 'time':
      return fmtTime(rec.time_seconds);
    case 'distance_time':
      return `${fmtNum(rec.distance_m)} ${unit(t('meters'))} · ${fmtTime(rec.time_seconds)}`;
    default:
      return '';
  }
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
  $('#tabFriends').textContent = t('nav_friends');
  const hash = location.hash || '#/me';
  const onFriends = hash.startsWith('#/friends') || hash.startsWith('#/u/');
  for (const [el, active] of [[$('#tabMe'), !onFriends], [$('#tabFriends'), onFriends]]) {
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
  return groupByExercise(records).map((g) =>
    h('section', { class: 'group' },
      h('header', { class: 'group-head' },
        h('h3', { class: 'display' }, g.exercise.name),
        h('span', { class: 'tag' }, categoryName(g.exercise.category)),
        h('span', { class: 'count' }, entriesText(g.items.length)),
      ),
      h('ul', { class: 'entries' }, g.items.map((r) => entryRow(r, { editable, onChange, index: n++ }))),
    ),
  );
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
      h('div', { class: 'entry-value', dir: 'ltr' }, valueText(rec)),
      h('div', { class: 'entry-meta' },
        h('span', {}, fmtDate(rec.performed_on)),
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

function openRecordDialog(rec, onSaved) {
  const dlg = $('#recordDialog');
  const vals = {
    weight: rec?.weight_kg != null ? fmtNum(rec.weight_kg) : '',
    reps: rec?.reps != null ? String(rec.reps) : '',
    time: rec?.time_seconds != null ? fmtTime(rec.time_seconds) : '',
    distance: rec?.distance_m != null ? String(rec.distance_m) : '',
    date: rec?.performed_on ?? todayISO(),
    note: rec?.note ?? '',
  };
  let exId = rec ? rec.exercise.id : Number(mineFilter) || exercises[0]?.id;

  const err = h('p', { class: 'form-error', role: 'alert' });
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
  function drawFields() {
    const kind = exerciseById(exId).kind;
    const parts = [];
    if (kind === 'weight_reps') {
      parts.push(numberField('f-weight', 'weight', t('weight'), { inputmode: 'decimal', autocomplete: 'off', required: true }));
    }
    if (kind === 'weight_reps' || kind === 'reps_only') {
      parts.push(numberField('f-reps', 'reps', t('reps'), { type: 'number', inputmode: 'numeric', min: 1, step: 1, required: true }));
    }
    if (kind === 'distance_time') {
      parts.push(numberField('f-dist', 'distance', t('distance'), { type: 'number', inputmode: 'numeric', min: 1, step: 1, required: true }));
    }
    if (kind === 'time' || kind === 'distance_time') {
      parts.push(numberField('f-time', 'time', t('time'), { inputmode: 'decimal', placeholder: t('time_hint'), autocomplete: 'off', required: true }));
    }
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
  const newErr = h('p', { class: 'form-error', role: 'alert' });
  const addExerciseBtn = h('button', {
      type: 'button', class: 'btn small',
      onclick: async () => {
        newErr.textContent = '';
        try {
          const made = await api('/api/exercises', {
            method: 'POST',
            body: { name: newName.value, kind: newKind.value, category: 'Custom' },
          });
          exercises.push(made);
          exId = made.id;
          fillSelect();
          drawFields();
          newName.value = '';
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
      if (kind === 'distance_time') body.distance_m = Number(vals.distance);
      if (kind === 'time' || kind === 'distance_time') body.time_seconds = parseTime(vals.time);
      if (Object.values(body).some((v) => typeof v === 'number' && !Number.isFinite(v))) {
        err.textContent = t('err_validation');
        return;
      }
      save.disabled = true;
      try {
        await api(rec ? `/api/records/${rec.id}` : '/api/records', { method: rec ? 'PUT' : 'POST', body });
        dlg.close();
        toast(t('saved'));
        onSaved();
      } catch (ex) {
        err.textContent = errorText(ex);
      }
      save.disabled = false;
    },
  },
    h('h2', { class: 'display' }, rec ? t('rec_edit') : t('rec_new')),
    field('f-ex', t('exercise'), select),
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
  if (hash === '#/me') viewMine();
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
