// The logs keep one row per day / per item, even though Google Sheets turns
// date-looking text into real dates (the bug seen on 2026-11-24: one Practice
// row per request instead of one per day).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A fake sheet that converts dates the way Sheets does: always on appendRow, and on setValues unless the cells are text. */
function fakeSheet(header, ctx) {
  const rows = [header.slice()];
  const fmt = {};
  const convert = (v, r, c) => (typeof v === 'string' && DATE_RE.test(v) && fmt[r + ':' + c] !== '@'
    ? vm.runInContext(`new Date(${v.slice(0, 4)}, ${Number(v.slice(5, 7)) - 1}, ${Number(v.slice(8, 10))})`, ctx) : v);
  return {
    rows,
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    appendRow(vals) { const r = rows.length + 1; rows.push(vals.map((v, i) => convert(v, r, i + 1, true))); },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
        setNumberFormat(f) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fmt[(r + i) + ':' + (c + j)] = f; return this; },
        setValues(vals) {
          vals.forEach((row, i) => {
            while (rows.length < r + i) rows.push([]);
            row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = convert(v, r + i, c + j); });
          });
          return this;
        }
      };
    }
  };
}

function load() {
  const ctx = {
    Utilities: { formatDate: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'America/New_York' },
    CalendarApp: { getDefaultCalendar: () => ({ getTimeZone: () => 'America/New_York' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Logger: { log() {} }
  };
  vm.createContext(ctx);
  for (const f of ['Code.js', 'Content.js', 'Engine.js', 'Progress.js', 'Today.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script', f), 'utf8'), ctx);
  }
  const sheets = {
    Practice: fakeSheet(['date', 'language', 'minutes', 'sessions', 'new_items', 'reviewed', 'theme', 'note', 'updated_at'], ctx),
    Shown: fakeSheet(['id', 'kind', 'theme', 'first_shown', 'last_shown', 'times_shown'], ctx),
    ThemeWeeks: fakeSheet(['week_start', 'tag', 'source', 'why', 'event_date', 'plan', 'chosen_at'], ctx)
  };
  ctx.sheet_ = (name) => sheets[name];
  ctx.config_ = () => ({ language: 'fr', tts_rate: 0.9, excluded_calendars: [] });
  return { ctx, sheets };
}

test('the fake sheet really converts dates, like Google Sheets (so the tests below mean something)', () => {
  const { ctx, sheets } = load();
  sheets.Practice.appendRow(['2026-11-24']);
  assert.ok(sheets.Practice.rows[1][0] instanceof vm.runInContext('Date', ctx));
});

test('Practice keeps one row per day across many requests', () => {
  const { ctx, sheets } = load();
  for (let i = 0; i < 5; i++) ctx.logPractice_('2026-11-24', { new_items: i === 0 ? 2 : 0, theme: 'Les soldes', note: 'claquer' });
  ctx.logPractice_('2026-11-24', { minutes: 4, sessions: 1 });
  ctx.logPractice_('2026-11-24', { minutes: 3, sessions: 1 });
  ctx.logPractice_('2026-11-25', { new_items: 1 });
  const rows = sheets.Practice.rows.slice(1);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].slice(0, 6), ['2026-11-24', 'fr', '7', '2', '2', '0']);
  assert.equal(typeof rows[0][0], 'string');   // stored as text, not converted
});

test('the row lookup also finds a day that Sheets already turned into a date', () => {
  const { ctx, sheets } = load();
  sheets.Practice.appendRow(['2026-11-24', 'fr', 0, 0, 2, 0, 'Les soldes', 'claquer', 't']);   // the old way: converted
  ctx.logPractice_('2026-11-24', { minutes: 5, sessions: 1 });
  assert.equal(sheets.Practice.rows.length, 2);
  assert.equal(sheets.Practice.rows[1][2], '5');
});

test('Shown keeps one row per item and counts days, not requests', () => {
  const { ctx, sheets } = load();
  const item = [{ id: 'seasonal.sales.03', kind: 'entry', theme: 'seasonal.sales' }];
  assert.equal(ctx.markShown_(item, '2026-11-24'), 1);
  assert.equal(ctx.markShown_(item, '2026-11-24'), 0);
  assert.equal(ctx.markShown_(item, '2026-11-24'), 0);
  ctx.markShown_(item, '2026-12-30');
  const rows = sheets.Shown.rows.slice(1);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], ['seasonal.sales.03', 'entry', 'seasonal.sales', '2026-11-24', '2026-12-30', '2']);
});

test('ThemeWeeks: re-choosing a week (Recalculer) updates its row instead of adding one', () => {
  const { ctx, sheets } = load();
  sheets.ThemeWeeks.appendRow(['2026-11-23', 'seasonal.sales', 'default', 'x', '', '{}', 't']);   // converted by Sheets
  assert.equal(ctx.findRow_(sheets.ThemeWeeks, '2026-11-23'), 2);
  ctx.writeRow_(sheets.ThemeWeeks, ctx.findRow_(sheets.ThemeWeeks, '2026-11-23'), ['2026-11-23', 'seasonal.gifts', 'calendar', 'y', '', '{}', 't2']);
  assert.equal(sheets.ThemeWeeks.rows.length, 2);
  assert.equal(sheets.ThemeWeeks.rows[1][1], 'seasonal.gifts');
});

test('finishing a day writes one Practice row; finishing again adds minutes, not rows', () => {
  const { ctx, sheets } = load();
  const today = ctx.Utilities.formatDate(new Date());
  ctx.markShown_([{ id: 'seasonal.sales.03', kind: 'entry', theme: 'seasonal.sales' }, { id: 'seasonal.sales.i04', kind: 'idiom', theme: 'seasonal.sales' }], today);
  const r = JSON.parse(JSON.stringify(ctx.apiComplete_({ mode: 'day', minutes: 6, entry_id: 'seasonal.sales.03', idiom_id: 'seasonal.sales.i04', theme: 'Les soldes', note: 'claquer' })));
  assert.equal(r.done, true);
  assert.equal(r.streak, 1);
  ctx.apiComplete_({ mode: 'day', minutes: 3, entry_id: 'seasonal.sales.03', idiom_id: 'seasonal.sales.i04' });
  const rows = sheets.Practice.rows.slice(1);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].slice(0, 5), [today, 'fr', '9', '2', '2']);   // 6+3 minutes, 2 sessions, 2 new items (not 4)
});

test('the streak counts finished days, through yesterday while today is not finished yet', () => {
  const { ctx } = load();
  const set = { '2026-11-22': true, '2026-11-23': true, '2026-11-24': true };
  assert.equal(ctx.streak_(set, '2026-11-24'), 3);
  assert.equal(ctx.streak_(set, '2026-11-25'), 3);   // today not finished: the streak is still alive
  assert.equal(ctx.streak_(set, '2026-11-26'), 0);   // a whole day missed
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.weekFlags_(set, '2026-11-25'))), [true, true, false, false, false, false, false]);
});

test('timestamps written to the Sheet are Eastern time, never UTC', () => {
  const src = ['Code.js', 'Engine.js', 'Today.js'].map((f) => fs.readFileSync(path.join(__dirname, '../apps-script', f), 'utf8')).join('\n');
  const iso = src.split('\n').filter((l) => /toISOString\(\)/.test(l) && !/slice\(0, 10\)/.test(l));
  assert.deepEqual(iso, []);   // only date arithmetic (…toISOString().slice(0, 10)) may use it
  const calls = [];
  const { ctx } = load();
  ctx.Utilities.formatDate = (d, tz, fmt) => { calls.push([tz, fmt]); return 'x'; };
  ctx.nowStamp_();
  assert.deepEqual(calls[0], ['America/New_York', 'yyyy-MM-dd HH:mm:ss z']);
});

test('Sunday ratings update the spaced-review columns in Shown and the review count in Practice', () => {
  const { ctx, sheets } = load();
  const today = ctx.Utilities.formatDate(new Date());
  ctx.markShown_([{ id: 'a.b.01', kind: 'entry', theme: 'a.b' }, { id: 'a.b.i01', kind: 'idiom', theme: 'a.b' }], '2026-11-24');
  ctx.apiComplete_({ mode: 'review', minutes: 5, ratings: { 'a.b.01': 'knew', 'a.b.i01': 'no', 'x.y.99': 'knew', 'a.b.02': 'maybe' } });
  const shown = sheets.Shown.rows.slice(1);
  assert.deepEqual(shown[0].slice(6), ['2', ctx.enShift_(today, 14), 'knew', today, '1', '1']);
  assert.deepEqual(shown[1].slice(6), ['1', ctx.enShift_(today, 7), 'no', today, '1', '0']);
  assert.equal(shown[0][4], '2026-11-24');   // last shown kept
  const practice = sheets.Practice.rows.slice(1);
  assert.equal(practice.length, 1);
  assert.equal(practice[0][5], '2');         // reviewed: only the two known items with a valid rating
});
