// The Today payload and its two logs (apps-script/Today.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const E = {};
vm.createContext(E);
for (const f of ['Content.js', 'Engine.js', 'Progress.js', 'Today.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script', f), 'utf8'), E);
const plain = (x) => JSON.parse(JSON.stringify(x));

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../content', f), 'utf8'));
const files = read('library/INDEX.json').files.map((f) => read('library/' + f));
const lib = { themes: read('themes.json'), calendar: read('default_calendar.json'), keywords: read('keywords.json'),
              entries: files.flatMap((f) => f.entries), idioms: files.flatMap((f) => f.idioms) };

const MON = '2026-11-23';
const choice = plain(E.chooseTheme_({ weekStart: MON, lib, history: [], events: [], available: E.completeTags_(lib) }));
const plan = plain(E.planWeek_({ weekStart: MON, tag: choice.tag, shown: {},
  entries: lib.entries.filter((e) => e.theme === choice.tag), idioms: lib.idioms.filter((i) => i.theme === choice.tag) }));
const week = { tag: choice.tag, why: choice.why, source: choice.source, plan };
const today = (date, nextTag) => plain(E.buildToday_({ date, week, lib, nextTag }));

test('Monday to Saturday each show that day’s entry and idiom from the plan', () => {
  for (let d = 0; d < 6; d++) {
    const t = today(E.enShift_(MON, d));
    assert.equal(t.mode, 'day');
    assert.equal(t.todayIndex, d);
    assert.equal(t.entry.id, plan.days[d].entry_id);
    assert.equal(t.idiom.id, plan.days[d].idiom_id);
  }
});

test('the six days cover the 4 B1 / 1 B2 / 1 argot mix with six different entries and idioms', () => {
  const days = [0, 1, 2, 3, 4, 5].map((d) => today(E.enShift_(MON, d)));
  assert.equal(new Set(days.map((t) => t.entry.id)).size, 6);
  assert.equal(new Set(days.map((t) => t.idiom.id)).size, 6);
  assert.deepEqual(days.map((t) => t.entry.level).sort(), ['B1', 'B1', 'B1', 'B1', 'B2', 'argot']);
});

test('Sunday is the review of the week’s six entries and idioms', () => {
  const t = today(E.enShift_(MON, 6));
  assert.equal(t.mode, 'review');
  assert.deepEqual(t.review.entries.map((e) => e.id), plan.review);
  assert.equal(t.review.idioms.length, 6);
});

test('the theme banner gets the name, why, and next week’s theme when it is known', () => {
  const t = today(MON, 'seasonal.gifts');
  assert.equal(t.theme.name_fr, 'Les soldes et les bonnes affaires');
  assert.equal(t.theme.why, 'Calendrier par défaut · semaine 48');
  assert.equal(t.theme.next_name_fr, 'Les cadeaux');
  assert.equal(today(MON).theme.next_name_fr, '');
});

test('Shown: a first view is new; a second view the same day changes nothing; a later day counts again', () => {
  const item = { id: 'seasonal.sales.04', kind: 'entry', theme: 'seasonal.sales' };
  const a = plain(E.shownRow_(null, item, '2026-11-24'));
  assert.deepEqual(a, { row: ['seasonal.sales.04', 'entry', 'seasonal.sales', '2026-11-24', '2026-11-24', 1], isNew: true, changed: true });
  assert.equal(plain(E.shownRow_(a.row, item, '2026-11-24')).changed, false);
  const c = plain(E.shownRow_(a.row, item, '2027-02-02'));
  assert.deepEqual(c.row, ['seasonal.sales.04', 'entry', 'seasonal.sales', '2026-11-24', '2027-02-02', 2]);
  assert.equal(c.isNew, false);
});

test('Practice: minutes, sessions and new items add up over the day; reviewed keeps the highest', () => {
  let p = plain(E.mergePractice_(null, { new_items: 2, theme: 'Les soldes', note: 'claquer' }, '2026-11-24', 'fr', 't1'));
  assert.deepEqual(p, { date: '2026-11-24', language: 'fr', minutes: 0, sessions: 0, new_items: 2, reviewed: 0, theme: 'Les soldes', note: 'claquer', updated_at: 't1', speaking: '' });
  p = plain(E.mergePractice_(p, { minutes: 4, sessions: 1 }, '2026-11-24', 'fr', 't2'));
  p = plain(E.mergePractice_(p, { minutes: 3, sessions: 1 }, '2026-11-24', 'fr', 't3'));
  assert.equal(p.minutes, 7);
  assert.equal(p.sessions, 2);
  assert.equal(p.note, 'claquer');
  assert.equal(plain(E.mergePractice_({ ...p, reviewed: 6 }, { reviewed: 0 }, '2026-11-24', 'fr', 't4')).reviewed, 6);
});

test('Practice minutes from the app are whole, never negative, at most 120', () => {
  assert.equal(E.sessionMinutes_(3.6), 4);
  assert.equal(E.sessionMinutes_(-5), 0);
  assert.equal(E.sessionMinutes_('abc'), 0);
  assert.equal(E.sessionMinutes_(500), 120);
});

test('the Practice tab columns are the ones VERA reads', () => {
  const issue = fs.readFileSync(path.join(__dirname, '../docs/vera/ISSUE.md'), 'utf8');
  assert.ok(issue.includes('| ' + [...E.PRACTICE_COLS_].join(' | ') + ' |'));
});
