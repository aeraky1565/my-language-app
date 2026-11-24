// ============================================================
// ÉLISE — Content.js
// The content library: Themes, DefaultCalendar, Keywords and Entries tabs of
// the Elise Sheet, how a row maps to an entry, and the validator.
//
// Everything above the "Sheet wrappers" line is pure (no Apps Script
// services), so tests/content.test.js runs it with Node.
// ============================================================

var CATEGORIES_ = ['travel', 'social', 'errands', 'work', 'daily', 'seasonal'];

var CONTENT_TABS_ = {
  Themes: ['tag', 'category', 'name_fr', 'name_en', 'related'],
  DefaultCalendar: ['week', 'tag'],
  Keywords: ['keyword', 'target'],
  Entries: ['id', 'theme', 'level', 'word', 'pos', 'fem', 'ipa', 'def_fr', 'def_en', 'example_fr', 'example_en',
            'phrase_fr', 'phrase_en', 'register', 'register_note',
            'd1_fr', 'd1_en', 'd2_fr', 'd2_en', 'd3_fr', 'd3_en', 'd4_fr', 'd4_en', 'tts']
};

var ENTRY_REQUIRED_ = ['id', 'theme', 'level', 'word', 'pos', 'ipa', 'def_fr', 'def_en', 'example_fr', 'example_en',
                       'phrase_fr', 'phrase_en', 'register', 'register_note'];

var ENTRIES_PER_THEME_ = { min: 10, max: 14 };

// Each week: 4 B1, 1 B2 ("Niveau +") and 1 argot, shuffled over Mon–Sat; Sunday
// reviews them. A theme needs at least this many of each so a repeat year
// still has unseen ones.
var LEVELS_ = ['B1', 'B2', 'argot'];
var LEVEL_MIN_PER_THEME_ = { B1: 6, B2: 2, argot: 2 };

// ---- Rows <-> objects (pure) ------------------------------------------------

/** Pure: entry object → Entries row. Dialogue speakers alternate A, B, A, B. */
function entryToRow_(e) {
  var d = e.dialogue || [];
  var row = [e.id, e.theme, e.level, e.word, e.pos, e.fem || '', e.ipa, e.def_fr, e.def_en, e.example_fr, e.example_en,
             e.phrase_fr, e.phrase_en, e.register, e.register_note];
  for (var i = 0; i < 4; i++) row.push(d[i] ? d[i].fr : '', d[i] ? d[i].en : '');
  row.push(e.tts || '');
  return row;
}

/** Pure: Entries row → entry object (the shape the app uses). */
function rowToEntry_(r) {
  var s = function (v) { return v == null ? '' : String(v).trim(); };
  var dialogue = [];
  for (var i = 0; i < 4; i++) {
    var fr = s(r[15 + i * 2]), en = s(r[16 + i * 2]);
    if (fr || en) dialogue.push({ who: i % 2 ? 'B' : 'A', fr: fr, en: en });
  }
  return {
    id: s(r[0]), theme: s(r[1]), level: s(r[2]), word: s(r[3]), pos: s(r[4]), fem: s(r[5]) || null, ipa: s(r[6]),
    def_fr: s(r[7]), def_en: s(r[8]), example_fr: s(r[9]), example_en: s(r[10]),
    phrase_fr: s(r[11]), phrase_en: s(r[12]), register: s(r[13]), register_note: s(r[14]),
    dialogue: dialogue, tts: s(r[23]) || null
  };
}

function themeToRow_(t) { return [t.tag, t.category, t.name_fr, t.name_en, (t.related || []).join(', ')]; }

function rowToTheme_(r) {
  return {
    tag: String(r[0]).trim(), category: String(r[1]).trim(), name_fr: String(r[2]).trim(), name_en: String(r[3]).trim(),
    related: String(r[4] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean)
  };
}

// ---- Validation (pure) ------------------------------------------------------

/** Pure: the word without its article, lower case ("l'ordre du jour" → "ordre du jour"). */
function lemma_(word) {
  return String(word || '').toLowerCase().trim()
    .replace(/^(le|la|les|un|une|des|se)\s+/, '')
    .replace(/^(l|s|d)['’]\s*/, '');
}

function norm_(s) { return String(s || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim(); }

/**
 * Pure: checks the library against the content rules.
 *   lib = { themes: [...], calendar: {week: tag}, keywords: [[kw, target]], entries: [...] }
 *   opts.complete: also require 10–14 entries for every theme (false while the
 *                  library is being written).
 * Returns { errors: [string], warnings: [string], counts: {tag: n} }.
 */
function validateLibrary_(lib, opts) {
  opts = opts || {};
  var errors = [], warnings = [];
  var tags = {};

  (lib.themes || []).forEach(function (t, i) {
    var where = 'Themes row ' + (i + 2) + ' (' + t.tag + ')';
    if (!/^[a-z]+\.[a-z_]+$/.test(t.tag)) errors.push(where + ': tag must look like category.name');
    if (tags[t.tag]) errors.push(where + ': duplicate tag');
    tags[t.tag] = t;
    if (CATEGORIES_.indexOf(t.category) === -1) errors.push(where + ': unknown category ' + t.category);
    if (t.tag.split('.')[0] !== t.category) errors.push(where + ': tag prefix does not match category');
    if (!t.name_fr || !t.name_en) errors.push(where + ': missing name');
    if (!t.related || !t.related.length) errors.push(where + ': needs at least one related tag');
  });
  (lib.themes || []).forEach(function (t) {
    (t.related || []).forEach(function (r) {
      if (r === t.tag) errors.push('Themes ' + t.tag + ': related to itself');
      else if (!tags[r]) errors.push('Themes ' + t.tag + ': related tag ' + r + ' does not exist');
    });
  });

  for (var w = 1; w <= 53; w++) {
    var tag = lib.calendar && lib.calendar[w];
    if (!tag) errors.push('DefaultCalendar: week ' + w + ' is missing');
    else if (!tags[tag]) errors.push('DefaultCalendar: week ' + w + ' uses unknown tag ' + tag);
  }

  var seenKw = {};
  (lib.keywords || []).forEach(function (k) {
    var kw = norm_(k[0]), target = k[1];
    if (!kw) return;
    if (seenKw[kw]) errors.push('Keywords: "' + kw + '" is listed twice');
    seenKw[kw] = true;
    if (!tags[target] && CATEGORIES_.indexOf(target) === -1) errors.push('Keywords: "' + kw + '" points to unknown ' + target);
  });

  var ids = {}, words = {}, counts = {}, levels = {};
  Object.keys(tags).forEach(function (t) { counts[t] = 0; levels[t] = { B1: 0, B2: 0, argot: 0 }; });
  (lib.entries || []).forEach(function (e, i) {
    var where = 'Entries row ' + (i + 2) + ' (' + (e.id || '?') + ')';
    ENTRY_REQUIRED_.forEach(function (f) { if (!e[f]) errors.push(where + ': missing ' + f); });
    if (!tags[e.theme]) { errors.push(where + ': unknown theme ' + e.theme); return; }
    counts[e.theme]++;
    if (LEVELS_.indexOf(e.level) === -1) errors.push(where + ': level must be B1, B2 or argot');
    else levels[e.theme][e.level]++;
    if (ids[e.id]) errors.push(where + ': duplicate id');
    ids[e.id] = true;
    if (e.id && e.id.indexOf(e.theme + '.') !== 0) errors.push(where + ': id must start with its theme');

    var l = lemma_(e.word);
    if (words[l]) errors.push(where + ': word "' + e.word + '" already used by ' + words[l]);
    words[l] = e.id;

    if (!e.dialogue || e.dialogue.length !== 4 || e.dialogue.some(function (d) { return !d.fr || !d.en; })) {
      errors.push(where + ': needs 4 dialogue lines, each in French and English');
    } else {
      // The phrase may run on inside the line ("…de froid, surtout à gauche"),
      // so its final punctuation is not part of the match.
      var p = norm_(e.phrase_fr).replace(/[\s.!?…]+$/, '');
      if (norm_(e.dialogue[0].fr).indexOf(p) === -1 && norm_(e.dialogue[1].fr).indexOf(p) === -1) {
        errors.push(where + ': the phrase must appear in dialogue line 1 or 2');
      }
    }
    if (!/^(tu|vous)\b/.test(String(e.register || ''))) errors.push(where + ': register must start with "tu" or "vous"');

    var ex = norm_(e.example_fr);
    if (ex.indexOf(l) === -1 && !(e.fem && ex.indexOf(lemma_(e.fem)) !== -1)) {
      warnings.push(where + ': the word does not appear as-is in its example');
    }
    if (e.ipa && !/^\/.+\/$/.test(e.ipa)) warnings.push(where + ': IPA should be written between slashes');
  });

  Object.keys(counts).forEach(function (t) {
    var n = counts[t];
    if (n > ENTRIES_PER_THEME_.max) errors.push('Theme ' + t + ': ' + n + ' entries (max ' + ENTRIES_PER_THEME_.max + ')');
    else if (opts.complete && n < ENTRIES_PER_THEME_.min) errors.push('Theme ' + t + ': ' + n + ' entries (min ' + ENTRIES_PER_THEME_.min + ')');
    if (opts.complete) {
      LEVELS_.forEach(function (lv) {
        if (levels[t][lv] < LEVEL_MIN_PER_THEME_[lv]) {
          errors.push('Theme ' + t + ': ' + levels[t][lv] + ' ' + lv + ' entries (min ' + LEVEL_MIN_PER_THEME_[lv] + ')');
        }
      });
    }
  });

  return { errors: errors, warnings: warnings, counts: counts, levels: levels };
}

// ---- Sheet wrappers (Apps Script only) -------------------------------------

/** Reads the whole library from the Elise Sheet. */
function readLibrary_() {
  var rows = function (name) {
    var sh = ss_().getSheetByName(name);
    return sh ? sh.getDataRange().getValues().slice(1).filter(function (r) { return String(r[0]).trim(); }) : [];
  };
  var calendar = {};
  rows('DefaultCalendar').forEach(function (r) { calendar[Number(r[0])] = String(r[1]).trim(); });
  return {
    themes: rows('Themes').map(rowToTheme_),
    calendar: calendar,
    keywords: rows('Keywords').map(function (r) { return [String(r[0]), String(r[1]).trim()]; }),
    entries: rows('Entries').map(rowToEntry_)
  };
}

/**
 * Run from the editor: checks the library in the Sheet and logs the result.
 * validateContent(true) also requires 10–14 entries for every theme.
 */
function validateContent(complete) {
  var res = validateLibrary_(readLibrary_(), { complete: complete === true });
  Logger.log(res.errors.length + ' error(s), ' + res.warnings.length + ' warning(s)');
  res.errors.forEach(function (m) { Logger.log('ERROR   ' + m); });
  res.warnings.forEach(function (m) { Logger.log('warning ' + m); });
  return res;
}
