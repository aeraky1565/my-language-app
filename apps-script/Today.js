// ============================================================
// ÉLISE — Today.js
// What the Today screen shows each day, and the two logs it keeps:
//   Shown     every entry and idiom you've seen: first and last day, how many
//             days (unseen-first picking now, spaced repetition later).
//   Practice  one row per day: minutes, sessions, new items, reviewed, theme,
//             note. VERA reads this tab (docs/vera/ISSUE.md); ÉLISE never calls VERA.
//
// Everything above the "Apps Script" line is pure and covered by
// tests/today.test.js.
// ============================================================

var PRACTICE_COLS_ = ['date', 'language', 'minutes', 'sessions', 'new_items', 'reviewed', 'theme', 'note', 'updated_at'];

// ---- pure --------------------------------------------------------------------

/**
 * Pure: the day's content from the week's plan.
 *   o = { date, week: { tag, why, source, plan }, lib: { themes, entries, idioms }, nextTag }
 * → { mode: 'day', todayIndex, theme, entry, idiom }            Monday to Saturday
 *   { mode: 'review', todayIndex: 6, theme, review: { entries, idioms } }   Sunday
 */
function buildToday_(o) {
  var byTag = themesByTag_(o.lib.themes), t = byTag[o.week.tag] || { tag: o.week.tag, name_fr: o.week.tag };
  var E = {}, I = {};
  (o.lib.entries || []).forEach(function (e) { E[e.id] = e; });
  (o.lib.idioms || []).forEach(function (i) { I[i.id] = i; });
  var plan = o.week.plan || { days: [], review: [] };
  var theme = {
    tag: t.tag, name_fr: t.name_fr, name_en: t.name_en, why: o.week.why || '', source: o.week.source || '',
    next_name_fr: o.nextTag && byTag[o.nextTag] ? byTag[o.nextTag].name_fr : ''
  };
  var dow = enDow_(o.date);
  if (dow === 6) {
    return {
      mode: 'review', todayIndex: 6, theme: theme,
      review: {
        entries: (plan.review || []).map(function (id) { return E[id]; }).filter(Boolean),
        idioms: (plan.days || []).map(function (d) { return I[d.idiom_id]; }).filter(Boolean)
      }
    };
  }
  var d = (plan.days || [])[dow] || (plan.days || [])[(plan.days || []).length - 1];
  return { mode: 'day', todayIndex: dow, theme: theme, entry: d ? E[d.entry_id] || null : null, idiom: d ? I[d.idiom_id] || null : null };
}

/**
 * Pure: a Shown row after seeing an item on `date`.
 *   prev = [id, kind, theme, first_shown, last_shown, times_shown] or null
 * → { row, isNew, changed }   (a second view the same day changes nothing)
 */
function shownRow_(prev, item, date) {
  if (!prev) return { row: [item.id, item.kind, item.theme, date, date, 1], isNew: true, changed: true };
  if (String(prev[4]) === date) return { row: prev, isNew: false, changed: false };
  return { row: [prev[0], prev[1], prev[2], prev[3], date, (Number(prev[5]) || 0) + 1], isNew: false, changed: true };
}

/** Pure: the day's Practice record with a patch added (minutes, sessions and new items add up). */
function mergePractice_(prev, patch, date, language, now) {
  var p = prev || {};
  var n = function (v) { return Number(v) || 0; };
  return {
    date: date, language: p.language || language,
    minutes: n(p.minutes) + n(patch.minutes), sessions: n(p.sessions) + n(patch.sessions),
    new_items: n(p.new_items) + n(patch.new_items), reviewed: Math.max(n(p.reviewed), n(patch.reviewed)),
    theme: patch.theme || p.theme || '', note: patch.note || p.note || '', updated_at: now
  };
}

/** Pure: minutes reported by the app → a sane whole number (0–120). */
function sessionMinutes_(raw) {
  var m = Math.round(Number(raw) || 0);
  return Math.max(0, Math.min(120, m));
}

// ---- Apps Script -----------------------------------------------------------------

/** The Today payload: the engine's day (or the built-in sample until the library is in the Sheet). */
function todayPayload_() {
  var today = recordVisit_(), visits = visitSet_(), saved = savedIndex_(), cfg = config_();
  var body = null;
  var lib = readLibrary_();
  if (completeTags_(lib).length) {
    var week = currentWeek_();
    var next = readThemeWeeks_().filter(function (h) { return h.week_start === enShift_(enMonday_(today), 7); })[0];
    body = buildToday_({ date: today, week: week, lib: lib, nextTag: next && next.tag });
    if (body.mode === 'day' && !body.entry) body = null;
  }
  if (!body) {
    body = { mode: 'day', todayIndex: weekdayIndex_(today), theme: SAMPLE_THEME_, entry: SAMPLE_ENTRY_, idiom: SAMPLE_IDIOM_, sample: true };
  } else {
    var items = body.mode === 'day'
      ? [{ id: body.entry.id, kind: 'entry', theme: body.entry.theme }].concat(body.idiom ? [{ id: body.idiom.id, kind: 'idiom', theme: body.idiom.theme }] : [])
      : [];
    var fresh = markShown_(items, today);
    logPractice_(today, {
      new_items: fresh,
      reviewed: body.mode === 'review' ? body.review.entries.length : 0,
      theme: body.theme.name_fr,
      note: body.mode === 'day' ? body.entry.word + (body.idiom ? ' · ' + body.idiom.fr : '') : 'Révision de la semaine'
    });
  }
  body.date = today;
  body.streak = streak_(visits, today);
  body.week = weekFlags_(visits, today);
  body.tts_rate = cfg.tts_rate;
  body.saved = body.mode === 'day' ? {
    word: !!saved[body.entry.id + ':word'],
    phrase: !!saved[body.entry.id + ':phrase'],
    idiom: !!(body.idiom && saved[body.idiom.id + ':idiom'])
  } : {};
  return body;
}

/** Records items as seen today. → how many were seen for the first time. */
function markShown_(items, date) {
  if (!items.length) return 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var sh = sheet_('Shown'), rows = sh.getDataRange().getValues(), at = {}, fresh = 0;
    rows.forEach(function (r, i) { if (i && r[0]) at[String(r[0])] = i + 1; });
    items.forEach(function (it) {
      var row = at[it.id], prev = row ? rows[row - 1].map(function (v, j) { return j >= 3 && j <= 4 ? cellDate_(v) : v; }) : null;
      var res = shownRow_(prev, it, date);
      if (!res.changed) return;
      if (res.isNew) { writeRow_(sh, 0, res.row); fresh++; }
      else writeRow_(sh, row, res.row);
    });
    return fresh;
  } finally {
    lock.releaseLock();
  }
}

/** Adds to today's row in the Practice tab (one row per day). */
function logPractice_(date, patch) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var sh = sheet_('Practice'), row = findRow_(sh, date), prev = null;
    if (row) {
      var v = sh.getRange(row, 1, 1, PRACTICE_COLS_.length).getValues()[0];
      prev = {};
      PRACTICE_COLS_.forEach(function (c, i) { prev[c] = v[i]; });
    }
    var m = mergePractice_(prev, patch, date, config_().language, new Date().toISOString());
    var out = PRACTICE_COLS_.map(function (c) { return m[c]; });
    writeRow_(sh, row, out);
  } finally {
    lock.releaseLock();
  }
}

/** API: the app reports a finished session. */
function apiPractice_(p) {
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  logPractice_(today, { minutes: sessionMinutes_(p && p.minutes), sessions: 1 });
  return { ok: true };
}

/** API: Réglages › Recalculer. */
function apiRerunWeek_() {
  rerunThisWeek();
  return todayPayload_();
}
