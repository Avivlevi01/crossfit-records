// Hebrew (default, right-to-left) and English. Exercise names stay in English in both.

const STRINGS = {
  he: {
    app_title: 'CrossFit Records – שיאים',
    nav_mine: 'השיאים שלי',
    nav_friends: 'החברים',
    nav_board: 'מובילים',
    logout: 'יציאה',
    lang_switch: 'EN',

    tagline: 'שיאים. חברים. ברזל.',
    login: 'התחברות',
    register: 'הרשמה',
    username: 'שם משתמש',
    password: 'סיסמה',
    invite: 'קוד הזמנה',
    username_hint: '3–32 תווים: אותיות, ספרות, נקודה, מקף או קו תחתון',
    password_hint: 'לפחות 8 תווים',
    invite_hint: 'את הקוד מקבלים מהמנהל',
    submit_login: 'כניסה',
    submit_register: 'יוצאים לדרך',

    err_login: 'שם משתמש או סיסמה שגויים',
    err_invite: 'קוד ההזמנה שגוי',
    err_taken: 'שם המשתמש תפוס',
    err_rate: 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות',
    err_validation: 'הפרטים לא תקינים',
    err_session: 'ההתחברות פגה, התחבר שוב',
    err_network: 'אין חיבור לשרת, נסה שוב',
    err_forbidden: 'אין לך הרשאה לפעולה הזו',
    err_generic: 'משהו השתבש, נסה שוב',

    mine_title: 'השיאים שלי',
    new_record: 'שיא חדש',
    filter_all: 'כל התרגילים',
    empty_mine: 'עוד אין רשומות. הרם משהו כבד והוסף את הראשונה.',
    empty_other: 'עוד אין רשומות.',
    entries: '{n} רשומות',
    entry_one: 'רשומה אחת',
    loading: 'טוען…',

    rec_new: 'רשומה חדשה',
    rec_edit: 'עריכת רשומה',
    exercise: 'תרגיל',
    weight: 'משקל (ק״ג)',
    reps: 'חזרות',
    time: 'זמן',
    min_short: 'דק׳',
    sec_short: 'שנ׳',
    minutes: 'דקות',
    seconds: 'שניות',
    distance: 'מרחק',
    unit_label: 'יחידה',
    ex_desc: 'תיאור (לא חובה)',
    date: 'תאריך',
    note: 'הערה',
    save: 'שמירה',
    cancel: 'ביטול',
    edit: 'עריכה',
    delete: 'מחיקה',
    confirm_delete: 'למחוק את הרשומה?',
    confirm_delete_comment: 'למחוק את ההערה?',
    saved: 'נשמר',
    deleted: 'נמחק',
    add_exercise: 'תרגיל משלי',
    ex_name: 'שם התרגיל',
    ex_kind: 'סוג מדידה',
    ex_create: 'הוספת תרגיל',
    ex_added: 'התרגיל נוסף',
    kind_weight_reps: 'משקל + חזרות',
    kind_reps_only: 'חזרות בלבד',
    kind_time: 'זמן',
    kind_distance_time: 'מרחק + זמן',
    kg: 'ק״ג',
    reps_word: 'חזרות',
    meters: 'מ׳',
    km: 'ק״מ',

    friends_title: 'החברים',
    you: '(אתה)',
    last_entry: 'אחרון: {date}',
    back: 'חזרה',
    records_of: 'השיאים של {name}',
    read_only: 'צפייה בלבד',

    comments: 'הערות',
    no_comments: 'אין הערות עדיין',
    comment_placeholder: 'כתוב הערה…',
    send: 'שליחה',

    board_title: 'טבלת מובילים',
    board_empty: 'עוד אין שיאים בטבלה. מי פותח ראשון?',
    board_pick: 'תרגיל',
    board_rank: 'מקום {rank} מתוך {total}',
    board_leader: 'אתה בפסגה. עכשיו תשמור עליה!',
    board_tied_lead: 'אתה בפסגה, בתיקו. שבור את התיקו!',
    board_gap: 'כדי לעקוף את {name}: {gap}',
    board_not_in: 'עוד אין לך שיא בתרגיל הזה',
    board_add: 'הוסף שיא',
    pr: 'PR',
    pr_current: 'שיא נוכחי',
    est_1rm: '1RM משוער',
    chart: 'גרף',
    chart_label: 'גרף התקדמות',
    chart_weight: 'משקל',
    chart_1rm: '1RM משוער',
    chart_reps: 'חזרות',
    chart_time: 'זמן',
    chart_distance: 'מרחק',
    chart_pace: 'קצב',
    chart_lower_better: 'זמן נמוך יותר = טוב יותר, לכן הציר הפוך (למעלה = שיפור)',
    chart_legend: 'זהב = שבירת שיא',
    pr_title: 'שיא אישי חדש!',
    pr_prev: 'השיא הקודם',
    pr_first: 'הרשומה הראשונה נשמרה. זה המספר לשבור!',
    pr_go: 'יאללה!',
    delta_faster: 'מהיר ב-{time}',

    cat_Strength: 'כוח',
    'cat_Olympic lifts': 'הרמות אולימפיות',
    cat_Gymnastics: 'גימנסטיקה',
    'cat_Benchmark WODs': 'WODs מפורסמים',
    cat_Endurance: 'סיבולת',
    cat_Hyrox: 'היירוקס',
    cat_Custom: 'שלי',
  },

  en: {
    app_title: 'CrossFit Records',
    nav_mine: 'My records',
    nav_friends: 'Friends',
    nav_board: 'Leaderboard',
    logout: 'Log out',
    lang_switch: 'עברית',

    tagline: 'Records. Friends. Iron.',
    login: 'Log in',
    register: 'Sign up',
    username: 'Username',
    password: 'Password',
    invite: 'Invite code',
    username_hint: '3–32 characters: letters, digits, dot, dash or underscore',
    password_hint: 'At least 8 characters',
    invite_hint: 'You get the code from the admin',
    submit_login: 'Enter',
    submit_register: "Let's go",

    err_login: 'Wrong username or password',
    err_invite: 'Wrong invite code',
    err_taken: 'That username is taken',
    err_rate: 'Too many attempts. Try again in a few minutes',
    err_validation: 'Some details are not valid',
    err_session: 'Your session expired, please log in again',
    err_network: "Can't reach the server, try again",
    err_forbidden: "You're not allowed to do that",
    err_generic: 'Something went wrong, try again',

    mine_title: 'My records',
    new_record: 'New record',
    filter_all: 'All exercises',
    empty_mine: 'No records yet. Lift something heavy and add your first one.',
    empty_other: 'No records yet.',
    entries: '{n} entries',
    entry_one: '1 entry',
    loading: 'Loading…',

    rec_new: 'New record',
    rec_edit: 'Edit record',
    exercise: 'Exercise',
    weight: 'Weight (kg)',
    reps: 'Reps',
    time: 'Time',
    min_short: 'min',
    sec_short: 'sec',
    minutes: 'Minutes',
    seconds: 'Seconds',
    distance: 'Distance',
    unit_label: 'Unit',
    ex_desc: 'Description (optional)',
    date: 'Date',
    note: 'Note',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    confirm_delete: 'Delete this record?',
    confirm_delete_comment: 'Delete this comment?',
    saved: 'Saved',
    deleted: 'Deleted',
    add_exercise: 'My own exercise',
    ex_name: 'Exercise name',
    ex_kind: 'Measured by',
    ex_create: 'Add exercise',
    ex_added: 'Exercise added',
    kind_weight_reps: 'Weight + reps',
    kind_reps_only: 'Reps only',
    kind_time: 'Time',
    kind_distance_time: 'Distance + time',
    kg: 'kg',
    reps_word: 'reps',
    meters: 'm',
    km: 'km',

    friends_title: 'Friends',
    you: '(you)',
    last_entry: 'Last: {date}',
    back: 'Back',
    records_of: "{name}'s records",
    read_only: 'View only',

    comments: 'Comments',
    no_comments: 'No comments yet',
    comment_placeholder: 'Write a comment…',
    send: 'Send',

    board_title: 'Leaderboard',
    board_empty: 'No records on the board yet. Who goes first?',
    board_pick: 'Exercise',
    board_rank: 'Rank {rank} of {total}',
    board_leader: "You're on top. Now defend it!",
    board_tied_lead: "You're on top, tied. Break the tie!",
    board_gap: 'To pass {name}: {gap}',
    board_not_in: "You don't have a record on this exercise yet",
    board_add: 'Add a record',
    pr: 'PR',
    pr_current: 'Current PR',
    est_1rm: 'Est. 1RM',
    chart: 'Chart',
    chart_label: 'Progress chart',
    chart_weight: 'Weight',
    chart_1rm: 'Est. 1RM',
    chart_reps: 'Reps',
    chart_time: 'Time',
    chart_distance: 'Distance',
    chart_pace: 'Pace',
    chart_lower_better: 'Lower is better, so the axis is flipped (up = improvement)',
    chart_legend: 'Gold = new PR',
    pr_title: 'NEW PR!',
    pr_prev: 'Previous PR',
    pr_first: "First one logged. That's the number to beat!",
    pr_go: "Let's go!",
    delta_faster: '{time} faster',

    cat_Strength: 'Strength',
    'cat_Olympic lifts': 'Olympic lifts',
    cat_Gymnastics: 'Gymnastics',
    'cat_Benchmark WODs': 'Benchmark WODs',
    cat_Endurance: 'Endurance',
    cat_Hyrox: 'Hyrox',
    cat_Custom: 'Custom',
  },
};

let lang = 'he';
try {
  const saved = localStorage.getItem('lang');
  if (saved === 'he' || saved === 'en') lang = saved;
} catch {
  /* storage blocked: keep the default */
}

export const getLang = () => lang;

export function setLang(next) {
  lang = next;
  try {
    localStorage.setItem('lang', next);
  } catch {
    /* ignore */
  }
  applyDocLang();
}

export function applyDocLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = t('app_title');
}

export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

/** "3 entries" / "1 entry". */
export function entriesText(n) {
  return n === 1 ? t('entry_one') : t('entries', { n });
}

/** Category names come from the server in English; translate the ones we know. */
export function categoryName(category) {
  const key = `cat_${category}`;
  return STRINGS[lang][key] ?? category;
}
