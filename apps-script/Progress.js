// ============================================================
// ÉLISE — Progress.js
// Level and progress, all in the backend (the Sheet's Config tab shows them):
//
//   Spaced review   Sunday's review is a self-test: each item is rated
//                   knew / unsure / no. Items live in 5 boxes, reviewed after
//                   1, 2, 4, 8, 16 weeks; knew moves up a box, unsure stays,
//                   no goes back to box 1. Box 4–5 = mastered. Due items come
//                   back in Sunday's review next to the week's own.
//   Speaking        each line said with the mic is compared with its target
//                   (0–100); the day's average goes to Practice › speaking.
//   Readiness       every Sunday night and after each review, the evidence for
//                   the next level is checked and written to Config:
//                   level_readiness (the numbers), level_suggestion (only when
//                   ready). ÉLISE never changes `level` itself: you do, in Config.
//
// Everything above the "Apps Script" line is pure (tests/progress.test.js).
// ============================================================

var LEITNER_WEEKS_ = [0, 1, 2, 4, 8, 16];   // index = box (1–5)
var MASTERED_BOX_ = 4;
var REVIEW_DUE_LIMIT_ = 6;
var RATINGS_ = ['knew', 'unsure', 'no'];

// What a level shows in a week (Mon–Sat), and what a theme needs to run it
// twice (so a repeat year still has unseen entries).
var MIX_BY_LEVEL_ = {
  B1: [['B1', 4], ['B2', 1], ['argot', 1]],
  B2: [['B1', 2], ['B2', 3], ['argot', 1]]
};
var REQUIRED_BY_LEVEL_ = {
  B1: { B1: 6, B2: 2, argot: 2 },
  B2: { B1: 4, B2: 6, argot: 2 }
};

// The evidence for moving up. Thresholds are a first guess, to tune on real data.
var LEVEL_RULES_ = {
  B1: { next: 'B2', weeks: 8, daysPerWeek: 4, recall: { B1: { rate: 0.85, min: 30 }, B2: { rate: 0.70, min: 10 } }, speaking: { avg: 70, min: 10 } },
  B2: { next: 'C1', weeks: 12, daysPerWeek: 4, recall: { B2: { rate: 0.85, min: 40 } }, speaking: { avg: 80, min: 15 } }
};
var READINESS_WINDOW_DAYS_ = 56;

// ---- pure ------------------------------------------------------------------------

function mixFor_(level) { return MIX_BY_LEVEL_[level] || MIX_BY_LEVEL_.B1; }
function requiredFor_(level) { return REQUIRED_BY_LEVEL_[level] || REQUIRED_BY_LEVEL_.B1; }

/** Pure: an item's spaced-review state after a rating on `date`. prev = { box, reviews, knew } or null. */
function leitnerNext_(prev, rating, date) {
  prev = prev || {};
  var box = Math.max(1, Math.min(5, Number(prev.box) || 1));
  if (rating === 'knew') box = Math.min(5, box + 1);
  else if (rating === 'no') box = 1;
  return {
    box: box, due: enShift_(date, 7 * LEITNER_WEEKS_[box]), last_rating: rating, last_review: date,
    reviews: (Number(prev.reviews) || 0) + 1, knew: (Number(prev.knew) || 0) + (rating === 'knew' ? 1 : 0)
  };
}

/** Pure: ids due for review on `date` (oldest due first), skipping `exclude`, at most `limit`. shown = { id: { due } }. */
function dueItems_(shown, date, exclude, limit) {
  exclude = exclude || {};
  return Object.keys(shown || {})
    .filter(function (id) { var d = shown[id].due; return d && d <= date && !exclude[id]; })
    .sort(function (a, b) { var x = shown[a].due, y = shown[b].due; return x < y ? -1 : x > y ? 1 : (a < b ? -1 : 1); })
    .slice(0, limit);
}

/** Pure: French text → lower-case words without accents or punctuation. */
function words_(s) {
  return enNorm_(s).replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, ' ').split(/\s+/).filter(Boolean);
}

/** Pure: how much of the target line was heard (0–100): the share of its words found in what was heard. */
function speakScore_(heard, target) {
  var want = words_(target), got = words_(heard), pool = {};
  if (!want.length) return 0;
  got.forEach(function (w) { pool[w] = (pool[w] || 0) + 1; });
  var hit = 0;
  want.forEach(function (w) { if (pool[w]) { pool[w]--; hit++; } });
  return Math.round(100 * hit / want.length);
}

/** Pure: the average score of a day's spoken lines → number, or '' when none. */
function speakingOfDay_(spoken) {
  var s = (spoken || []).filter(function (x) { return x && x.target; }).map(function (x) { return speakScore_(x.heard, x.target); });
  return s.length ? Math.round(s.reduce(function (a, b) { return a + b; }, 0) / s.length) : '';
}

/**
 * Pure: is the evidence there for the next level?
 *   o = { level, since: 'yyyy-MM-dd', today,
 *         items: [{ level, reviews, knew, last_review, box }],   (entries you have reviewed)
 *         practice: [{ date, speaking }] }                       (finished days)
 * → { level, next, ready, checks: [{ key, label, value, target, ok, skipped }], mastered, summary }
 */
function readiness_(o) {
  var rule = LEVEL_RULES_[o.level];
  var from = enShift_(o.today, -READINESS_WINDOW_DAYS_);
  var mastered = (o.items || []).filter(function (x) { return Number(x.box) >= MASTERED_BOX_; }).length;
  if (!rule) return { level: o.level, next: '', ready: false, checks: [], mastered: mastered, summary: o.level + ' : pas de niveau suivant pour l’instant' };
  var checks = [];
  var weeks = Math.floor((enParse_(o.today) - enParse_(o.since || o.today)) / 864e5 / 7);
  checks.push({ key: 'weeks', label: 'semaines au niveau', value: weeks, target: rule.weeks, ok: weeks >= rule.weeks });

  var days = (o.practice || []).filter(function (p) { return p.date >= from && p.date <= o.today; });
  var perWeek = Math.round(10 * days.length / (READINESS_WINDOW_DAYS_ / 7)) / 10;
  checks.push({ key: 'days', label: 'jours/semaine', value: perWeek, target: rule.daysPerWeek, ok: perWeek >= rule.daysPerWeek });

  Object.keys(rule.recall).forEach(function (lv) {
    var r = rule.recall[lv];
    var its = (o.items || []).filter(function (x) { return x.level === lv && x.last_review && x.last_review >= from; });
    var n = its.reduce(function (a, x) { return a + (Number(x.reviews) || 0); }, 0);
    var k = its.reduce(function (a, x) { return a + (Number(x.knew) || 0); }, 0);
    var rate = n ? k / n : 0;
    checks.push({ key: 'recall_' + lv, label: 'rappel ' + lv, value: n ? Math.round(100 * rate) : null, target: Math.round(100 * r.rate),
                  ok: n >= r.min && rate >= r.rate, note: n < r.min ? n + '/' + r.min + ' révisions' : '' });
  });

  var sp = days.filter(function (p) { return p.speaking !== '' && p.speaking != null && !isNaN(Number(p.speaking)); }).map(function (p) { return Number(p.speaking); });
  if (!sp.length) {
    checks.push({ key: 'speaking', label: 'oral', value: null, target: rule.speaking.avg, ok: true, skipped: true, note: 'non mesuré' });
  } else {
    var avg = Math.round(sp.reduce(function (a, b) { return a + b; }, 0) / sp.length);
    checks.push({ key: 'speaking', label: 'oral', value: avg, target: rule.speaking.avg, ok: sp.length >= rule.speaking.min && avg >= rule.speaking.avg,
                  note: sp.length < rule.speaking.min ? sp.length + '/' + rule.speaking.min + ' jours' : '' });
  }

  var ready = checks.every(function (c) { return c.ok; });
  var okCount = checks.filter(function (c) { return c.ok && !c.skipped; }).length, total = checks.filter(function (c) { return !c.skipped; }).length;
  var parts = checks.map(function (c) {
    var v = c.value == null ? '—' : c.value + (c.key.indexOf('recall') === 0 || c.key === 'speaking' ? ' %' : '');
    var t = c.target + (c.key.indexOf('recall') === 0 || c.key === 'speaking' ? ' %' : '');
    return c.label + ' ' + v + ' / ' + t + (c.skipped ? ' (' + c.note + ')' : c.ok ? ' ✓' : c.note ? ' (' + c.note + ')' : '');
  });
  return {
    level: o.level, next: rule.next, ready: ready, checks: checks, mastered: mastered,
    summary: o.level + ' → ' + rule.next + ' : ' + okCount + '/' + total + ' critères · ' + parts.join(' · ') + ' · ' + mastered + ' mots maîtrisés'
  };
}

// ---- Apps Script -------------------------------------------------------------------

/** Applies Sunday's ratings ({ id: 'knew'|'unsure'|'no' }) to the Shown rows. → how many were rated. */
function applyRatings_(ratings, date) {
  var ids = Object.keys(ratings || {}).filter(function (id) { return RATINGS_.indexOf(ratings[id]) !== -1; });
  if (!ids.length) return 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var sh = sheet_('Shown'), rows = sh.getDataRange().getValues(), n = 0;
    rows.forEach(function (r, i) {
      var id = String(r[0]);
      if (!i || !ratings[id] || RATINGS_.indexOf(ratings[id]) === -1) return;
      var s = leitnerNext_({ box: r[6], reviews: r[10], knew: r[11] }, ratings[id], date);
      var row = r.slice(0, 6).map(function (v, j) { return j >= 3 && j <= 4 ? cellDate_(v) : v; })
        .concat([s.box, s.due, s.last_rating, s.last_review, s.reviews, s.knew]);
      writeRow_(sh, i + 1, row);
      n++;
    });
    return n;
  } finally {
    lock.releaseLock();
  }
}

/** Checks the evidence for the next level and writes it to Config (level_readiness, level_suggestion). */
function updateReadiness_() {
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  var raw = readConfig_(), level = raw.level || 'B1';
  if (raw.level_seen !== level || !raw.level_since) {   // a new level (or first run): the clock starts now
    writeConfig_('level_since', raw.level_seen && raw.level_seen !== level ? today : (raw.level_since || firstPracticeDay_() || today));
    writeConfig_('level_seen', level);
    raw = readConfig_();
  }
  var lib = readLibrary_(), levelOf = {};
  lib.entries.forEach(function (e) { levelOf[e.id] = e.level; });
  var items = [];
  sheet_('Shown').getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0] && String(r[1]) === 'entry' && r[9]) {
      items.push({ level: levelOf[String(r[0])] || '', box: r[6], last_review: cellDate_(r[9]), reviews: r[10], knew: r[11] });
    }
  });
  var practice = sheet_('Practice').getDataRange().getValues().slice(1).filter(function (r) { return r[0]; })
    .map(function (r) { return { date: cellDate_(r[0]), speaking: r[9] }; });
  var res = readiness_({ level: level, since: cellDate_(raw.level_since), today: today, items: items, practice: practice });
  writeConfig_('level_readiness', res.summary + ' (' + today + ')');
  writeConfig_('level_suggestion', res.ready
    ? 'Prêt pour ' + res.next + ' ? Vérifiez avec un test blanc (TCF ou DELF ' + res.next + '), puis remplacez « level » par ' + res.next + '.'
    : '');
  return res;
}

function firstPracticeDay_() {
  var d = '';
  sheet_('Practice').getDataRange().getValues().slice(1).forEach(function (r) { var x = r[0] ? cellDate_(r[0]) : ''; if (x && (!d || x < d)) d = x; });
  return d;
}
