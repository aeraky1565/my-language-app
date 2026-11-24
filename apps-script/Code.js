// ============================================================
// ÉLISE — Code.js
// Everyday Language Immersion & Speaking Engine.
// A standalone Apps Script project that serves a JSON API to the ÉLISE web
// app on GitHub Pages (the same shape as VERA).
//
//   - Data lives in the "Elise" Google Sheet (DEFAULT_SHEET_ID_ below). setup()
//     records it in the Script Property ELISE_SHEET_ID, which wins if it is
//     ever changed. The id alone gives no access: the Sheet stays private.
//   - Settings live in that Sheet's Config tab (key | value).
//   - Every request must carry the token kept in the Script Property
//     ELISE_TOKEN. No token, no data.
//   - All calls are GET (?action=…&token=…&p=<json>), which avoids CORS
//     preflight from the GitHub Pages origin.
//
// Step 1 (scaffold): one sample entry, visits/streak, saved words and
// phrases, settings with the calendar list. The content library, the theme
// engine and the daily ÉLISE calendar event come in later steps.
// ============================================================

var DEFAULT_SHEET_ID_ = '17faT__UTAeGHRUu5Nya2lhm62IUYSrOwRpTRZ6A7WeA';

var TABS_ = {
  Config: ['key', 'value'],
  Visits: ['date', 'first_open'],
  Saved: ['id', 'type', 'fr', 'en', 'theme', 'entry_id', 'saved_at']
};

// ÉLISE's own calendar: one all-day event per theme week (written in a later
// step). Never read as an input.
var ELISE_CALENDAR_NAME_ = 'ÉLISE';

var DEFAULT_CONFIG_ = {
  excluded_calendars: '[]',
  tts_rate: '0.9'
};

// Placeholder until the content library lands in step 2.
var SAMPLE_THEME_ = {
  tag: 'seasonal.sales',
  name_fr: 'Les soldes et les bonnes affaires',
  name_en: 'Sales and bargains',
  next_name_fr: 'Les cadeaux',
  why: 'Calendrier par défaut · semaine 48'
};

var SAMPLE_ENTRY_ = {
  id: 'seasonal.sales.01',
  word: 'dépensier',
  pos: 'adj.',
  fem: 'dépensière',
  ipa: '/de.pɑ̃.sje/',
  def_fr: 'Qui aime dépenser son argent, parfois un peu trop.',
  def_en: 'Free-spending; someone who spends easily, sometimes too much.',
  example_fr: 'Pendant les soldes, je deviens vraiment dépensier.',
  example_en: 'During the sales, I get really spendy.',
  phrase_fr: 'Tu crois que ça vaut le coup ?',
  phrase_en: 'Do you think it’s worth it?',
  register: 'tu · entre amis',
  register_note: '« tu » — on parle à une amie. Avec un vendeur : « Vous pensez que ça vaut le coup ? »',
  idiom: {
    fr: 'jeter l’argent par les fenêtres',
    literal: 'to throw money out of the windows',
    en: 'to waste money, to throw money away',
    example_fr: 'Un troisième manteau ? C’est jeter l’argent par les fenêtres !',
    example_en: 'A third coat? That’s throwing money away!'
  },
  dialogue: [
    { who: 'A', fr: 'Regarde, le manteau est à moins cinquante pour cent !', en: 'Look, the coat is fifty percent off!' },
    { who: 'B', fr: 'Tu crois que ça vaut le coup ?', en: 'Do you think it’s worth it?' },
    { who: 'A', fr: 'Franchement, oui. Il était hors de prix avant.', en: 'Honestly, yes. It was way overpriced before.' },
    { who: 'B', fr: 'Bon, vas-y… mais ne sois pas trop dépensière cette fois !', en: 'OK, go for it… but don’t go overboard this time!' }
  ]
};

// ---- Setup -----------------------------------------------------------------

/**
 * Run once, by hand, from the Apps Script editor. Sets up the Elise Sheet
 * (its tabs and defaults; creates a new Sheet only if no id is known) and the
 * access token. Logs the token and what to do next; never logs anything else.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ELISE_SHEET_ID') || DEFAULT_SHEET_ID_;
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Elise');
  }
  props.setProperty('ELISE_SHEET_ID', ss.getId());
  Object.keys(TABS_).forEach(function (name) { sheet_(name, ss); });
  var blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Feuille 1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);

  var cfg = readConfig_();
  Object.keys(DEFAULT_CONFIG_).forEach(function (k) {
    if (!(k in cfg)) writeConfig_(k, DEFAULT_CONFIG_[k]);
  });

  var token = props.getProperty('ELISE_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ELISE_TOKEN', token);
  }
  CalendarApp.getDefaultCalendar().getTimeZone(); // covers the calendar authorization now

  Logger.log('Elise Sheet: ' + ss.getUrl());
  Logger.log('Token: ' + token);
  Logger.log('Next: Deploy › New deployment › Web app, then open the web app with');
  Logger.log('  https://aeraky1565.github.io/my-language-app/#api=<WEB APP URL>&token=' + token);
}

// ---- Web API ---------------------------------------------------------------

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (!authorized_(params.token)) return out_({ ok: false, error: 'unauthorized' });
  var p = {};
  try { p = params.p ? JSON.parse(params.p) : {}; } catch (err) { return out_({ ok: false, error: 'bad_payload' }); }
  try {
    switch (params.action || 'ping') {
      case 'ping':          return out_({ ok: true });
      case 'today':         return out_({ ok: true, data: apiToday_() });
      case 'saved':         return out_({ ok: true, data: apiListSaved_() });
      case 'toggle_saved':  return out_({ ok: true, data: apiToggleSaved_(p) });
      case 'remove_saved':  return out_({ ok: true, data: apiRemoveSaved_(p.id) });
      case 'settings':      return out_({ ok: true, data: apiSettings_() });
      case 'save_settings': return out_({ ok: true, data: apiSaveSettings_(p) });
      default:              return out_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    console.error(err);
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function authorized_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('ELISE_TOKEN');
  return !!expected && !!token && token === expected;
}

function out_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Actions ---------------------------------------------------------------

function apiToday_() {
  var today = recordVisit_();
  var visits = visitSet_();
  var saved = savedIndex_();
  return {
    date: today,
    streak: streak_(visits, today),
    week: weekFlags_(visits, today),
    todayIndex: weekdayIndex_(today),
    theme: SAMPLE_THEME_,
    entry: SAMPLE_ENTRY_,
    saved: {
      word: !!saved[SAMPLE_ENTRY_.id + ':word'],
      idiom: !!saved[SAMPLE_ENTRY_.id + ':idiom'],
      phrase: !!saved[SAMPLE_ENTRY_.id + ':phrase']
    },
    tts_rate: config_().tts_rate
  };
}

function apiToggleSaved_(item) {
  var id = item.entry_id + ':' + item.type;
  var sh = sheet_('Saved');
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var row = findRow_(sh, id);
    if (row) { sh.deleteRow(row); return { saved: false }; }
    sh.appendRow([id, item.type, item.fr, item.en, item.theme, item.entry_id, new Date().toISOString()]);
    return { saved: true };
  } finally {
    lock.releaseLock();
  }
}

function apiRemoveSaved_(id) {
  var sh = sheet_('Saved');
  var row = findRow_(sh, id);
  if (row) sh.deleteRow(row);
  return { removed: !!row };
}

function apiListSaved_() {
  return sheet_('Saved').getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return { id: r[0], type: r[1], fr: r[2], en: r[3], theme: r[4], entry_id: r[5], saved_at: String(r[6]) };
    })
    .reverse();
}

function apiSettings_() {
  var c = config_();
  var calendars = CalendarApp.getAllCalendars()
    .filter(function (cal) { return cal.getName() !== ELISE_CALENDAR_NAME_; })
    .map(function (cal) {
      return { id: cal.getId(), name: cal.getName(), color: cal.getColor(), included: c.excluded_calendars.indexOf(cal.getId()) === -1 };
    });
  return {
    tts_rate: c.tts_rate,
    calendars: calendars
  };
}

function apiSaveSettings_(patch) {
  if ('tts_rate' in patch) writeConfig_('tts_rate', String(Number(patch.tts_rate) || 0.9));
  if (patch.calendar) {
    var excluded = config_().excluded_calendars.filter(function (id) { return id !== patch.calendar.id; });
    if (!patch.calendar.included) excluded.push(patch.calendar.id);
    writeConfig_('excluded_calendars', JSON.stringify(excluded));
  }
  return apiSettings_();
}

// ---- Visits and streak -----------------------------------------------------

function tz_() {
  try { return CalendarApp.getDefaultCalendar().getTimeZone(); } catch (e) { return Session.getScriptTimeZone(); }
}

function cellDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd') : String(v);
}

function recordVisit_() {
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    if (!visitSet_()[today]) sheet_('Visits').appendRow([today, new Date().toISOString()]);
  } finally {
    lock.releaseLock();
  }
  return today;
}

function visitSet_() {
  var set = {};
  sheet_('Visits').getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0]) set[cellDate_(r[0])] = true;
  });
  return set;
}

/** Pure: 'yyyy-MM-dd' shifted by n days. */
function shiftDay_(key, n) {
  var p = key.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}

/** Pure: Monday = 0 … Sunday = 6. */
function weekdayIndex_(key) {
  var p = key.split('-').map(Number);
  return (new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() + 6) % 7;
}

/** Pure: consecutive visited days ending today. */
function streak_(visits, today) {
  var n = 0, day = today;
  while (visits[day]) { n++; day = shiftDay_(day, -1); }
  return n;
}

/** Pure: seven booleans, Monday to Sunday of today's week. */
function weekFlags_(visits, today) {
  var monday = shiftDay_(today, -weekdayIndex_(today)), flags = [];
  for (var i = 0; i < 7; i++) flags.push(!!visits[shiftDay_(monday, i)]);
  return flags;
}

// ---- Sheet helpers ---------------------------------------------------------

var _ss_ = null;

function ss_() {
  if (_ss_) return _ss_;
  var id = PropertiesService.getScriptProperties().getProperty('ELISE_SHEET_ID') || DEFAULT_SHEET_ID_;
  _ss_ = SpreadsheetApp.openById(id);
  return _ss_;
}

function sheet_(name, ss) {
  ss = ss || ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:A').setNumberFormat('@'); // dates and ids stay plain text
    sh.appendRow(TABS_[name]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

function readConfig_() {
  var out = {};
  sheet_('Config').getDataRange().getValues().slice(1).forEach(function (r) { if (r[0]) out[r[0]] = String(r[1]); });
  return out;
}

function writeConfig_(key, value) {
  var sh = sheet_('Config');
  var row = findRow_(sh, key);
  if (row) sh.getRange(row, 2).setValue(value);
  else sh.appendRow([key, value]);
}

function config_() {
  var c = Object.assign({}, DEFAULT_CONFIG_, readConfig_());
  var excluded = [];
  try { excluded = JSON.parse(c.excluded_calendars); } catch (e) {}
  return { excluded_calendars: excluded, tts_rate: Number(c.tts_rate) || 0.9 };
}

function savedIndex_() {
  var idx = {};
  sheet_('Saved').getDataRange().getValues().slice(1).forEach(function (r) { if (r[0]) idx[r[0]] = true; });
  return idx;
}
