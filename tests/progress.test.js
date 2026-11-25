// Level and progress (apps-script/Progress.js): spaced review, speaking score,
// readiness for the next level, and the level-dependent weekly mix.
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

// ---- Spaced review ---------------------------------------------------------------

test('knew moves up a box, unsure stays, no goes back to box 1; due follows 1, 2, 4, 8, 16 weeks', () => {
  const d = '2026-11-29';
  let s = plain(E.leitnerNext_(null, 'knew', d));
  assert.deepEqual(s, { box: 2, due: '2026-12-13', last_rating: 'knew', last_review: d, reviews: 1, knew: 1 });
  s = plain(E.leitnerNext_(s, 'knew', '2026-12-13'));
  assert.equal(s.box, 3);
  assert.equal(s.due, '2027-01-10');                 // 4 weeks
  assert.equal(plain(E.leitnerNext_(s, 'unsure', '2027-01-10')).box, 3);
  const back = plain(E.leitnerNext_(s, 'no', '2027-01-10'));
  assert.equal(back.box, 1);
  assert.equal(back.due, '2027-01-17');              // 1 week
  assert.equal(back.reviews, 3);
  assert.equal(back.knew, 2);
  let top = { box: 5 };
  top = plain(E.leitnerNext_(top, 'knew', d));
  assert.equal(top.box, 5);                          // never above box 5
  assert.equal(top.due, E.enShift_(d, 16 * 7));
});

test('due items: oldest due first, skipping the week’s own and anything not yet due', () => {
  const shown = {
    a: { due: '2026-11-15' }, b: { due: '2026-11-29' }, c: { due: '2026-12-06' }, d: { due: '' }, e: { due: '2026-11-01' }
  };
  assert.deepEqual([...E.dueItems_(shown, '2026-11-29', { b: true }, 6)], ['e', 'a']);
  assert.deepEqual([...E.dueItems_(shown, '2026-11-29', {}, 2)], ['e', 'a']);
});

test('Sunday’s review lists the week’s items first, then the due ones marked due', () => {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../content', f), 'utf8'));
  const files = read('library/INDEX.json').files.map((f) => read('library/' + f));
  const lib = { themes: read('themes.json'), entries: files.flatMap((f) => f.entries), idioms: files.flatMap((f) => f.idioms) };
  const week = { tag: 'seasonal.sales', plan: { days: [{ entry_id: 'seasonal.sales.01', idiom_id: 'seasonal.sales.i01' }], review: ['seasonal.sales.01'] } };
  const t = plain(E.buildToday_({ date: '2026-11-29', week, lib, due: ['errands.dentist.01', 'travel.airport.i01', 'nope'] }));
  assert.deepEqual(t.review.entries.map((x) => [x.id, !!x.due]), [['seasonal.sales.01', false], ['errands.dentist.01', true]]);
  assert.deepEqual(t.review.idioms.map((x) => [x.id, !!x.due]), [['seasonal.sales.i01', false], ['travel.airport.i01', true]]);
});

// ---- Speaking -------------------------------------------------------------------------

test('speaking score: the share of the target’s words heard, ignoring case, accents and punctuation', () => {
  const target = 'Oui, mais quitte à dépenser, autant prendre la meilleure qualité.';
  assert.equal(E.speakScore_('oui mais quitte a depenser autant prendre la meilleure qualite', target), 100);
  assert.equal(E.speakScore_('oui mais quitte à dépenser', target), 50);   // 5 of 10 words
  assert.equal(E.speakScore_('', target), 0);
  assert.equal(E.speakScore_("C'est l'heure", "c'est l'heure !"), 100);
  assert.equal(E.speakingOfDay_([{ target: 'un deux', heard: 'un deux' }, { target: 'un deux', heard: 'un' }]), 75);
  assert.equal(E.speakingOfDay_([]), '');
});

// ---- Readiness ----------------------------------------------------------------------------

const today = '2027-03-01';
const days = (n, speaking) => Array.from({ length: n }, (_, i) => ({ date: E.enShift_(today, -i), speaking }));
const items = (level, n, reviews, knew) => Array.from({ length: n }, () => ({ level, reviews, knew, last_review: E.enShift_(today, -3), box: 4 }));

test('ready for B2 when every check passes', () => {
  const r = plain(E.readiness_({
    level: 'B1', since: '2026-12-01', today,
    items: [...items('B1', 20, 2, 2), ...items('B2', 6, 2, 2)],
    practice: days(40, 80)
  }));
  assert.equal(r.next, 'B2');
  assert.equal(r.ready, true, r.summary);
  assert.equal(r.mastered, 26);
  assert.match(r.summary, /^B1 → B2 : 5\/5 critères/);
});

test('not ready: too soon, too few days, weak recall, too few reviews, low speaking', () => {
  const base = { level: 'B1', since: '2026-12-01', today, items: [...items('B1', 20, 2, 2), ...items('B2', 6, 2, 2)], practice: days(40, 80) };
  const fails = (o) => plain(E.readiness_({ ...base, ...o })).checks.filter((c) => !c.ok).map((c) => c.key);
  assert.deepEqual(fails({ since: '2027-02-01' }), ['weeks']);
  assert.deepEqual(fails({ practice: days(20, 80) }), ['days']);
  assert.deepEqual(fails({ items: [...items('B1', 20, 2, 1), ...items('B2', 6, 2, 2)] }), ['recall_B1']);
  assert.deepEqual(fails({ items: [...items('B1', 20, 2, 2), ...items('B2', 2, 2, 2)] }), ['recall_B2']);   // 4 reviews < 10
  assert.deepEqual(fails({ practice: days(40, 50) }), ['speaking']);
});

test('reviews older than 8 weeks do not count, and no speaking data is skipped rather than blocking', () => {
  const old = items('B1', 20, 2, 2).map((x) => ({ ...x, last_review: '2026-11-01' }));
  const r = plain(E.readiness_({ level: 'B1', since: '2026-12-01', today, items: [...old, ...items('B2', 6, 2, 2)], practice: days(40, '') }));
  assert.equal(r.checks.find((c) => c.key === 'recall_B1').ok, false);
  const sp = r.checks.find((c) => c.key === 'speaking');
  assert.equal(sp.skipped, true);
  assert.equal(sp.ok, true);
});

test('a level without a rule has no next step', () => {
  const r = plain(E.readiness_({ level: 'C1', since: today, today, items: [], practice: [] }));
  assert.equal(r.ready, false);
  assert.equal(r.next, '');
});

// ---- The level drives the content ----------------------------------------------------------

const entry = (id, level) => ({ id, level });
const ENTRIES = [
  ...['b1a', 'b1b', 'b1c', 'b1d', 'b1e', 'b1f'].map((x) => entry(x, 'B1')),
  ...['b2a', 'b2b', 'b2c', 'b2d', 'b2e', 'b2f'].map((x) => entry(x, 'B2')),
  entry('arga', 'argot'), entry('argb', 'argot')
];

test('the weekly mix follows the level: B1 = 4/1/1, B2 = 2/3/1', () => {
  const mix = (level) => plain(E.planWeek_({ weekStart: '2027-03-01', tag: 'x.y', entries: ENTRIES, idioms: [], shown: {}, level }))
    .days.map((d) => d.level).sort();
  assert.deepEqual(mix('B1'), ['B1', 'B1', 'B1', 'B1', 'B2', 'argot']);
  assert.deepEqual(mix('B2'), ['B1', 'B1', 'B2', 'B2', 'B2', 'argot']);
  assert.deepEqual(mix(undefined), ['B1', 'B1', 'B1', 'B1', 'B2', 'argot']);
});

test('B2 mode needs 6 B2 entries per theme, so today no theme can run it yet', () => {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../content', f), 'utf8'));
  const files = read('library/INDEX.json').files.map((f) => read('library/' + f));
  const lib = { themes: read('themes.json'), calendar: read('default_calendar.json'), keywords: read('keywords.json'),
                entries: files.flatMap((f) => f.entries), idioms: files.flatMap((f) => f.idioms) };
  assert.ok(E.completeTags_(lib, 'B1').length >= 7);
  assert.deepEqual([...E.completeTags_(lib, 'B2')], []);
});
