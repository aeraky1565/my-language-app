// ============================================================
// ÉLISE — Engine.js
// The theme engine: which theme a week gets, and which entries and idioms
// each day of that week shows.
//
// Everything above the "Apps Script wrappers" line is pure (no Apps Script
// services) and covered by tests/engine.test.js.
//
// THE RULES (docs/SPEC.md §5, with the changes recorded there):
//  1. Calendar first. Events in the week AFTER the theme week (Monday+7 to
//     Sunday+13) are matched against the Keywords tab, so you practise the week
//     before the event. Skipped: recurring events, declined events, and all-day
//     birthday-style reminders (multi-day all-day events such as a trip count).
//     A keyword that names a theme beats one that names a category. Between
//     events: travel > social > errands > work > daily > seasonal, then the
//     earliest date. An event whose theme is on cooldown tries that theme's
//     related themes; if none is free, the next event is tried.
//  2. Otherwise the default calendar: the theme for the week's ISO week. In
//     even ISO years every non-seasonal default is swapped for its first related
//     theme. A default on cooldown falls back to its related themes, then to the
//     least recently used free theme.
//  3. Cooldown: a theme used in any of the previous 8 weeks is not picked.
//  4. Only themes whose content is complete can be picked (while the library is
//     being written).
//  5. Locked: once a week has a theme it keeps it, unless the run is forced
//     (Réglages › Recalculer).
//  6. The week's plan: Mon–Sat show 4 B1, 1 B2 and 1 argot entry, shuffled with
//     a seed from the week, so every run agrees; Sunday reviews them. Unseen
//     entries first, then the ones seen longest ago. Six idioms the same way.
// ============================================================

var CATEGORY_ORDER_ = ['travel', 'social', 'errands', 'work', 'daily', 'seasonal'];
var COOLDOWN_WEEKS_ = 8;
var WEEK_MIX_ = [['B1', 4], ['B2', 1], ['argot', 1]];
var MOIS_ = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
var BIRTHDAY_RE_ = /\b(birthday|bday|b-day|anniversaire)\b/;

// ---- Dates (pure) -----------------------------------------------------------

function enParse_(ymd) { var p = String(ymd).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
function enYmd_(ms) { return new Date(ms).toISOString().slice(0, 10); }
function enShift_(ymd, n) { return enYmd_(enParse_(ymd) + n * 864e5); }
/** Pure: Monday = 0 … Sunday = 6. */
function enDow_(ymd) { return (new Date(enParse_(ymd)).getUTCDay() + 6) % 7; }
function enMonday_(ymd) { return enShift_(ymd, -enDow_(ymd)); }

/** Pure: ISO 8601 week of a date → { year, week }. The week belongs to the year of its Thursday. */
function isoWeek_(ymd) {
  var thursday = enShift_(ymd, 3 - enDow_(ymd));
  var year = Number(thursday.slice(0, 4));
  var week = Math.floor((enParse_(thursday) - Date.UTC(year, 0, 1)) / 864e5 / 7) + 1;
  return { year: year, week: week };
}

function frDate_(ymd) {
  var p = String(ymd).split('-').map(Number);
  return p[2] + (p[2] === 1 ? 'er' : '') + ' ' + MOIS_[p[1] - 1];
}

// ---- Keyword matching (pure) -------------------------------------------------

/** Pure: lower case, no accents, curly quotes straightened. */
function enNorm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'");
}

/** Pure: a regex that finds the keyword as whole word(s), plural "s" allowed. */
function keywordRegex_(kw) {
  var k = enNorm_(kw).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  var tail = /[a-z]$/.test(enNorm_(kw).trim()) ? 's?' : '';
  return new RegExp('(^|[^a-z0-9])' + k + tail + '(?=$|[^a-z0-9])');
}

/** Pure: should this event be ignored? */
function skipEvent_(e) {
  if (e.recurring || e.declined) return true;
  if (e.allDay && (!e.end || e.end <= enShift_(e.start, 1))) {   // a single all-day day
    if (BIRTHDAY_RE_.test(enNorm_(e.title)) || /#contacts@/.test(String(e.calendarId || ''))) return true;
  }
  return false;
}

/**
 * Pure: the best keyword hit for one event → { target, category, keyword } or null.
 * A keyword naming a theme beats one naming a category; then category order; then
 * the keyword that comes first in the title ("Birthday dinner" is a birthday);
 * then the order of the Keywords tab.
 */
function matchEvent_(e, keywords, themesByTag) {
  var text = enNorm_(e.title + ' ' + (e.location || ''));
  var best = null;
  keywords.forEach(function (k, i) {
    var kw = k[0], target = k[1];
    var hit = kw ? keywordRegex_(kw).exec(text) : null;
    if (!hit) return;
    var isTag = !!themesByTag[target];
    var category = isTag ? themesByTag[target].category : target;
    var rank = [isTag ? 0 : 1, CATEGORY_ORDER_.indexOf(category), hit.index, i];
    var better = !best;
    for (var r = 0; !better && r < rank.length && rank[r] <= best.rank[r]; r++) better = rank[r] < best.rank[r];
    if (better) best = { target: target, category: category, keyword: kw, rank: rank };
  });
  return best;
}

/**
 * Pure: matching events in the detection window of the week starting weekStart,
 * best first → [{ target, category, keyword, title, date }].
 */
function calendarCandidates_(events, lib, weekStart) {
  var from = enShift_(weekStart, 7), to = enShift_(weekStart, 13);
  var byTag = themesByTag_(lib.themes);
  var out = [];
  (events || []).forEach(function (e) {
    if (!e || !e.start || e.start < from || e.start > to || skipEvent_(e)) return;
    var m = matchEvent_(e, lib.keywords || [], byTag);
    if (m) out.push({ target: m.target, category: m.category, keyword: m.keyword, title: e.title, date: e.start });
  });
  out.sort(function (a, b) {
    var c = CATEGORY_ORDER_.indexOf(a.category) - CATEGORY_ORDER_.indexOf(b.category);
    return c || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  });
  return out;
}

// ---- Choosing the theme (pure) ------------------------------------------------

function themesByTag_(themes) {
  var m = {};
  (themes || []).forEach(function (t) { m[t.tag] = t; });
  return m;
}

/** Pure: themes used in the COOLDOWN_WEEKS_ weeks before weekStart. */
function cooledTags_(history, weekStart) {
  var from = enShift_(weekStart, -7 * COOLDOWN_WEEKS_), set = {};
  (history || []).forEach(function (h) { if (h.week_start >= from && h.week_start < weekStart) set[h.tag] = true; });
  return set;
}

/** Pure: a theme tag, or a category, → a free theme tag (itself, then its related themes), or null. */
function resolveTarget_(target, lib, ok) {
  var byTag = themesByTag_(lib.themes);
  if (byTag[target]) {
    if (ok(target)) return target;
    var rel = (byTag[target].related || []).filter(ok);
    return rel.length ? rel[0] : null;
  }
  var inCat = (lib.themes || []).filter(function (t) { return t.category === target && ok(t.tag); });
  return inCat.length ? inCat[0].tag : null;
}

/** Pure: the default-calendar theme for the week → { tag, swapped, week }. */
function defaultTheme_(lib, weekStart, ok, history, avail) {
  var iw = isoWeek_(weekStart), byTag = themesByTag_(lib.themes);
  var base = lib.calendar[iw.week] || lib.calendar[String(iw.week)] || lib.calendar[52] || lib.calendar['52'];
  var t = byTag[base];
  var swap = iw.year % 2 === 0 && t && t.category !== 'seasonal' && t.related && t.related.length;
  var order = [];
  if (swap) order.push(t.related[0]);
  order.push(base);
  ((t && t.related) || []).forEach(function (r) { if (order.indexOf(r) === -1) order.push(r); });
  for (var i = 0; i < order.length; i++) {
    if (byTag[order[i]] && ok(order[i])) return { tag: order[i], swapped: i === 0 && !!swap, week: iw.week };
  }
  // Everything near the default is taken: the free theme used longest ago.
  var lastUsed = {};
  (history || []).forEach(function (h) { if (!lastUsed[h.tag] || h.week_start > lastUsed[h.tag]) lastUsed[h.tag] = h.week_start; });
  var byAge = function (a, b) { var x = String(lastUsed[a.tag] || ''), y = String(lastUsed[b.tag] || ''); return x < y ? -1 : x > y ? 1 : 0; };
  var free = (lib.themes || []).filter(function (x) { return ok(x.tag); }).sort(byAge);
  if (free.length) return { tag: free[0].tag, swapped: false, week: iw.week };
  // Every usable theme is on cooldown (a small library): relax the cooldown, but
  // never pick a theme that has no content.
  var usable = (lib.themes || []).filter(function (x) { return !avail || avail(x.tag); }).sort(byAge);
  return { tag: usable.length ? usable[0].tag : base, swapped: false, week: iw.week };
}

/**
 * Pure: the theme for the week starting weekStart (a Monday).
 *   input = { weekStart, events, lib: {themes, calendar, keywords}, history: [{week_start, tag, …}],
 *             available: [tags] or null (= every theme), force }
 * → { week_start, tag, source: 'calendar'|'default'|'locked', why, event_date }
 */
function chooseTheme_(input) {
  var weekStart = input.weekStart, lib = input.lib, history = input.history || [];
  var existing = history.filter(function (h) { return h.week_start === weekStart; })[0];
  if (existing && !input.force) {
    return { week_start: weekStart, tag: existing.tag, source: 'locked', why: existing.why || '', event_date: existing.event_date || '' };
  }
  var past = history.filter(function (h) { return h.week_start !== weekStart; });
  var cooled = cooledTags_(past, weekStart);
  var avail = null;
  if (input.available) { avail = {}; input.available.forEach(function (t) { avail[t] = true; }); }
  var ok = function (tag) { return !cooled[tag] && (!avail || avail[tag]); };

  var cands = calendarCandidates_(input.events, lib, weekStart);
  for (var i = 0; i < cands.length; i++) {
    var tag = resolveTarget_(cands[i].target, lib, ok);
    if (tag) {
      return { week_start: weekStart, tag: tag, source: 'calendar',
               why: '« ' + cands[i].title + ' » le ' + frDate_(cands[i].date), event_date: cands[i].date };
    }
  }
  var d = defaultTheme_(lib, weekStart, ok, past, avail ? function (t) { return !!avail[t]; } : null);
  return { week_start: weekStart, tag: d.tag, source: 'default',
           why: 'Calendrier par défaut · semaine ' + d.week, event_date: '' };
}

// ---- Which themes are complete (pure) -------------------------------------------

/** Pure: tags with enough content to run a week: 10+ entries (6 B1, 2 B2, 2 argot) and 6 idioms. */
function completeTags_(lib) {
  var res = validateLibrary_(lib, { complete: true });
  var bad = {};
  res.errors.forEach(function (m) { var x = /^Theme ([a-z_]+\.[a-z_]+):/.exec(m); if (x) bad[x[1]] = true; });
  return (lib.themes || []).map(function (t) { return t.tag; }).filter(function (t) { return !bad[t] && res.counts[t] > 0; });
}

// ---- The week's plan (pure) -----------------------------------------------------

/** Pure: a 32-bit hash of a string (FNV-1a). */
function enHash_(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Pure: a copy of list shuffled by a seeded generator (mulberry32). */
function seededShuffle_(list, seed) {
  var a = list.slice(), s = seed >>> 0;
  var rnd = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}

/** Pure: n items, never-shown first (in id order), then the ones shown longest ago. */
function pickFresh_(items, shown, n) {
  var unseen = items.filter(function (x) { return !shown[x.id]; }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  var seen = items.filter(function (x) { return shown[x.id]; }).sort(function (a, b) {
    var la = shown[a.id].last_shown || '', lb = shown[b.id].last_shown || '';
    return la < lb ? -1 : la > lb ? 1 : (a.id < b.id ? -1 : 1);
  });
  return unseen.concat(seen).slice(0, n);
}

/**
 * Pure: the plan for a theme week.
 *   input = { weekStart, tag, entries: [entries of the theme], idioms: [idioms of the theme],
 *             shown: { id: { last_shown, times_shown } } }
 * → { days: [{ day: 0..5, entry_id, level, idiom_id }], review: [entry ids] }   (day 0 = Monday; Sunday is the review)
 */
function planWeek_(input) {
  var shown = input.shown || {}, entries = input.entries || [], chosen = [], used = {};
  WEEK_MIX_.forEach(function (mix) {
    pickFresh_(entries.filter(function (e) { return e.level === mix[0]; }), shown, mix[1])
      .forEach(function (e) { chosen.push(e); used[e.id] = true; });
  });
  if (chosen.length < 6) {   // a level ran short: top up from whatever is left
    pickFresh_(entries.filter(function (e) { return !used[e.id]; }), shown, 6 - chosen.length).forEach(function (e) { chosen.push(e); });
  }
  var order = seededShuffle_(chosen, enHash_(input.weekStart + '|' + input.tag));
  var idioms = seededShuffle_(pickFresh_(input.idioms || [], shown, 6), enHash_(input.weekStart + '|' + input.tag + '|idioms'));
  return {
    days: order.map(function (e, i) { return { day: i, entry_id: e.id, level: e.level, idiom_id: idioms[i] ? idioms[i].id : '' }; }),
    review: order.map(function (e) { return e.id; })
  };
}

// ---- Apps Script wrappers ----------------------------------------------------------

var ENGINE_TABS_ = {
  ThemeWeeks: ['week_start', 'tag', 'source', 'why', 'event_date', 'plan', 'chosen_at'],
  Shown: ['id', 'kind', 'theme', 'first_shown', 'last_shown', 'times_shown']
};

function todayYmd_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

/** Your calendars' events between two days, in the shape the engine reads. Never writes. */
function readEvents_(fromYmd, toYmd) {
  var excluded = config_().excluded_calendars;
  var tzz = tz_(), start = new Date(fromYmd + 'T00:00:00'), end = new Date(enShift_(toYmd, 1) + 'T00:00:00');
  var out = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    if (excluded.indexOf(cal.getId()) !== -1 || cal.getName() === ELISE_CALENDAR_NAME_) return;
    cal.getEvents(start, end).forEach(function (ev) {
      var allDay = ev.isAllDayEvent();
      var s = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
      var e = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
      var status = '';
      try { status = String(ev.getMyStatus()); } catch (x) {}
      out.push({
        title: ev.getTitle(), location: ev.getLocation(), allDay: allDay,
        start: Utilities.formatDate(s, tzz, 'yyyy-MM-dd'), end: Utilities.formatDate(e, tzz, 'yyyy-MM-dd'),
        recurring: ev.isRecurringEvent(), declined: status === 'NO', calendarId: cal.getId()
      });
    });
  });
  return out;
}

function readThemeWeeks_() {
  return sheet_('ThemeWeeks').getDataRange().getValues().slice(1).filter(function (r) { return r[0]; }).map(function (r) {
    return { week_start: cellDate_(r[0]), tag: String(r[1]), source: String(r[2]), why: String(r[3]),
             event_date: r[4] ? cellDate_(r[4]) : '', plan: r[5] ? JSON.parse(r[5]) : null };
  });
}

function readShown_() {
  var m = {};
  sheet_('Shown').getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0]) m[String(r[0])] = { last_shown: cellDate_(r[4]), times_shown: Number(r[5]) || 0 };
  });
  return m;
}

/** Chooses (or re-chooses, when forced) the theme and plan for a week, and stores them in ThemeWeeks. */
function weekFor_(weekStart, force) {
  var history = readThemeWeeks_();
  var existing = history.filter(function (h) { return h.week_start === weekStart; })[0];
  if (existing && !force) return existing;
  var lib = readLibrary_();
  var choice = chooseTheme_({
    weekStart: weekStart, lib: lib, history: history, force: !!force,
    available: completeTags_(lib), events: readEvents_(enShift_(weekStart, 7), enShift_(weekStart, 13))
  });
  var plan = planWeek_({
    weekStart: weekStart, tag: choice.tag, shown: readShown_(),
    entries: lib.entries.filter(function (e) { return e.theme === choice.tag; }),
    idioms: lib.idioms.filter(function (i) { return i.theme === choice.tag; })
  });
  var row = [weekStart, choice.tag, choice.source, choice.why, choice.event_date, JSON.stringify(plan), new Date().toISOString()];
  var sh = sheet_('ThemeWeeks'), at = findRow_(sh, weekStart);
  if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  Logger.log('Week of ' + weekStart + ': ' + choice.tag + ' (' + choice.source + ': ' + choice.why + ')');
  return { week_start: weekStart, tag: choice.tag, source: choice.source, why: choice.why, event_date: choice.event_date, plan: plan };
}

/** Trigger, Sundays at 21:00: chooses next week's theme. */
function chooseNextWeek() { return weekFor_(enShift_(enMonday_(todayYmd_()), 7), false); }

/** The current week's theme, chosen now if it has none yet (first launch). */
function currentWeek_() { return weekFor_(enMonday_(todayYmd_()), false); }

/** Réglages › Recalculer: re-chooses this week's theme, ignoring the lock. */
function rerunThisWeek() { return weekFor_(enMonday_(todayYmd_()), true); }

/** Run once from the editor: the Sunday 21:00 trigger (replaces an earlier one). */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'chooseNextWeek') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('chooseNextWeek').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(21).create();
  Logger.log('Trigger set: chooseNextWeek, Sundays at 21:00 (' + Session.getScriptTimeZone() + ').');
}
