// The theme engine (apps-script/Engine.js): one test per rule in docs/SPEC.md §5.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {};
vm.createContext(ctx);
for (const f of ['Content.js', 'Engine.js', 'Progress.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script', f), 'utf8'), ctx);
}
const E = ctx;
const plain = (x) => JSON.parse(JSON.stringify(x));

// ---- A small, predictable library -------------------------------------------

const T = (tag, related) => ({ tag, category: tag.split('.')[0], name_fr: tag, name_en: tag, related });
const LIB = {
  themes: [
    T('travel.airport', ['travel.train', 'travel.hotel']),
    T('travel.train', ['travel.airport']),
    T('travel.hotel', ['travel.airport']),
    T('social.cafe_friends', ['social.hosting_dinner']),
    T('social.hosting_dinner', ['daily.cooking', 'social.cafe_friends']),
    T('social.birthday_party', ['social.cafe_friends']),
    T('errands.dentist', ['errands.doctor']),
    T('errands.doctor', ['errands.dentist']),
    T('work.meetings', ['work.presentations']),
    T('work.presentations', ['work.meetings']),
    T('daily.cooking', ['social.hosting_dinner']),
    T('daily.gym_sport', ['daily.cooking']),
    T('seasonal.sales', ['daily.gym_sport']),
    T('seasonal.gifts', ['seasonal.sales'])
  ],
  calendar: Object.fromEntries(Array.from({ length: 53 }, (_, i) => [i + 1, 'daily.gym_sport'])),
  keywords: [
    ['flight', 'travel.airport'], ['aéroport', 'travel.airport'], ['train', 'travel.train'], ['trip', 'travel'],
    ['dinner', 'social.hosting_dinner'], ['birthday', 'social.birthday_party'], ['party', 'social'],
    ['dentist', 'errands.dentist'], ['appointment', 'errands'], ['meeting', 'work.meetings']
  ]
};
LIB.calendar[48] = 'seasonal.sales';
LIB.calendar[49] = 'seasonal.gifts';
LIB.calendar[10] = 'work.meetings';

const MON = '2027-03-01';   // a Monday, ISO 2027-W09 (odd year)
const day = (n) => E.enShift_(MON, n);
const ev = (title, d, extra) => ({ title, start: day(d), end: day(d), ...extra });
const choose = (o) => plain(E.chooseTheme_({ weekStart: MON, lib: LIB, history: [], events: [], ...o }));

// ---- Dates ----------------------------------------------------------------------

test('ISO weeks, including the 53-week year 2026 and January days in the previous ISO year', () => {
  assert.deepEqual(plain(E.isoWeek_('2026-11-23')), { year: 2026, week: 48 });
  assert.deepEqual(plain(E.isoWeek_('2026-12-28')), { year: 2026, week: 53 });
  assert.deepEqual(plain(E.isoWeek_('2027-01-01')), { year: 2026, week: 53 });
  assert.deepEqual(plain(E.isoWeek_('2027-01-04')), { year: 2027, week: 1 });
  assert.equal(E.enMonday_('2026-11-29'), '2026-11-23');
});

// ---- Rule 1: calendar ------------------------------------------------------------

test('only events in the week after the theme week count (Monday+7 to Sunday+13)', () => {
  assert.equal(choose({ events: [ev('Dentist', 6)] }).source, 'default');
  assert.equal(choose({ events: [ev('Dentist', 7)] }).tag, 'errands.dentist');
  assert.equal(choose({ events: [ev('Dentist', 13)] }).tag, 'errands.dentist');
  assert.equal(choose({ events: [ev('Dentist', 14)] }).source, 'default');
});

test('matching ignores case and accents, needs whole words, and allows a plural', () => {
  assert.equal(choose({ events: [ev('Navette AEROPORT Lyon', 8)] }).tag, 'travel.airport');
  assert.equal(choose({ events: [ev('Team training session', 8)] }).source, 'default');   // not "train"
  assert.equal(choose({ events: [ev('Two dinners out', 8)] }).tag, 'social.hosting_dinner');
  assert.equal(choose({ events: [ev('Pick up keys', 8, { location: 'Dentist office' })] }).tag, 'errands.dentist');
});

test('recurring, declined and all-day birthday reminders are skipped; a multi-day trip is not', () => {
  assert.equal(choose({ events: [ev('Dentist', 8, { recurring: true })] }).source, 'default');
  assert.equal(choose({ events: [ev('Dentist', 8, { declined: true })] }).source, 'default');
  assert.equal(choose({ events: [ev("Mom's birthday", 8, { allDay: true, end: day(9) })] }).source, 'default');
  assert.equal(choose({ events: [ev('Birthday dinner at 8pm', 8)] }).tag, 'social.birthday_party');
  assert.equal(choose({ events: [ev('Alaska trip', 8, { allDay: true, end: day(15) })] }).tag, 'travel.airport');
});

test('a keyword naming a theme beats one naming a category', () => {
  assert.equal(choose({ events: [ev('Birthday party', 8)] }).tag, 'social.birthday_party');
});

test('between events: travel > social > errands > work, then the earliest date', () => {
  const r = choose({ events: [ev('Team meeting', 7), ev('Dentist', 8), ev('Dinner at Léa’s', 12)] });
  assert.equal(r.tag, 'social.hosting_dinner');
  assert.equal(r.why, '« Dinner at Léa’s » le 13 mars');
  assert.equal(choose({ events: [ev('Train to Lyon', 12), ev('Flight to Paris', 9)] }).tag, 'travel.airport');
});

test('a category keyword takes the first free theme of that category', () => {
  assert.equal(choose({ events: [ev('Appointment', 8)] }).tag, 'errands.dentist');
  const h = [{ week_start: E.enShift_(MON, -7), tag: 'errands.dentist' }];
  assert.equal(choose({ events: [ev('Appointment', 8)], history: h }).tag, 'errands.doctor');
});

// ---- Rule 3: cooldown ----------------------------------------------------------------

test('a theme used in the last 8 weeks is skipped for its first free related theme', () => {
  const recent = [{ week_start: E.enShift_(MON, -21), tag: 'social.hosting_dinner' }];
  assert.equal(choose({ events: [ev('Dinner', 9)], history: recent }).tag, 'daily.cooking');
  const old = [{ week_start: E.enShift_(MON, -63), tag: 'social.hosting_dinner' }];   // 9 weeks ago
  assert.equal(choose({ events: [ev('Dinner', 9)], history: old }).tag, 'social.hosting_dinner');
  const edge = [{ week_start: E.enShift_(MON, -56), tag: 'social.hosting_dinner' }];  // exactly 8 weeks ago
  assert.equal(choose({ events: [ev('Dinner', 9)], history: edge }).tag, 'daily.cooking');
});

test('when an event and all its related themes are on cooldown, the next event is tried, then the default', () => {
  const h = ['errands.dentist', 'errands.doctor'].map((tag, i) => ({ week_start: E.enShift_(MON, -7 * (i + 1)), tag }));
  assert.equal(choose({ events: [ev('Dentist', 8), ev('Team meeting', 9)], history: h }).tag, 'work.meetings');
  assert.equal(choose({ events: [ev('Dentist', 8)], history: h }).source, 'default');
});

// ---- Rule 2: default calendar ----------------------------------------------------------

test('the default follows the ISO week; even years swap non-seasonal themes, seasonal ones never', () => {
  const at = (weekStart) => plain(E.chooseTheme_({ weekStart, lib: LIB, history: [], events: [] }));
  assert.equal(at('2027-03-08').tag, 'work.meetings');        // 2027-W10, odd year
  assert.equal(at('2026-03-02').tag, 'work.presentations');   // 2026-W10, even year: swapped
  assert.equal(at('2026-11-23').tag, 'seasonal.sales');       // 2026-W48, even year: seasonal, kept
  assert.equal(at('2026-11-23').why, 'Calendrier par défaut · semaine 48');
});

test('a default on cooldown falls back to its related themes, then to the theme used longest ago', () => {
  const at = (weekStart, history) => plain(E.chooseTheme_({ weekStart, lib: LIB, history, events: [] })).tag;
  const w = '2027-03-08';
  assert.equal(at(w, [{ week_start: E.enShift_(w, -7), tag: 'work.meetings' }]), 'work.presentations');
  const both = [{ week_start: E.enShift_(w, -7), tag: 'work.meetings' }, { week_start: E.enShift_(w, -14), tag: 'work.presentations' }];
  const lru = plain(E.chooseTheme_({ weekStart: w, lib: LIB, history: both, events: [],
    available: ['work.meetings', 'work.presentations', 'daily.cooking', 'travel.train'] }));
  assert.ok(['daily.cooking', 'travel.train'].includes(lru.tag));
});

// ---- Rule 4: only complete themes --------------------------------------------------------

test('a theme that is not available is never picked, from the calendar or the default', () => {
  const avail = ['daily.cooking', 'travel.train', 'daily.gym_sport'];
  assert.equal(choose({ events: [ev('Flight to Paris', 8)], available: avail }).tag, 'travel.train');
  assert.equal(choose({ events: [ev('Dinner', 8)], available: avail }).tag, 'daily.cooking');
  const d = plain(E.chooseTheme_({ weekStart: '2027-03-08', lib: LIB, history: [], events: [], available: avail }));
  assert.ok(avail.includes(d.tag));
});

test('when every available theme is on cooldown, the one used longest ago is picked, never an unavailable one', () => {
  const avail = ['travel.train', 'daily.cooking'];
  const history = [{ week_start: E.enShift_(MON, -14), tag: 'travel.train' }, { week_start: E.enShift_(MON, -7), tag: 'daily.cooking' }];
  assert.equal(choose({ history, available: avail }).tag, 'travel.train');
});

// ---- Rule 5: lock ------------------------------------------------------------------------

test('a week keeps its theme unless the run is forced; a forced run ignores the week’s own record', () => {
  const history = [{ week_start: MON, tag: 'travel.hotel', why: 'x' }];
  const locked = choose({ events: [ev('Dentist', 8)], history });
  assert.equal(locked.tag, 'travel.hotel');
  assert.equal(locked.source, 'locked');
  const forced = choose({ events: [ev('Flight to Paris', 8)], history: [{ week_start: MON, tag: 'travel.airport' }], force: true });
  assert.equal(forced.tag, 'travel.airport');   // its own record is not a cooldown
});

// ---- Rule 6: the week's plan ---------------------------------------------------------------

const entry = (id, level) => ({ id, level });
const ENTRIES = [
  ...['b1a', 'b1b', 'b1c', 'b1d', 'b1e', 'b1f', 'b1g', 'b1h'].map((x) => entry(x, 'B1')),
  entry('b2a', 'B2'), entry('b2b', 'B2'), entry('arga', 'argot'), entry('argb', 'argot')
];
const IDIOMS = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'].map((id) => ({ id }));
const plan = (o) => plain(E.planWeek_({ weekStart: MON, tag: 'x.y', entries: ENTRIES, idioms: IDIOMS, shown: {}, ...o }));

test('a week shows 4 B1, 1 B2 and 1 argot entry, plus 6 idioms, and Sunday reviews the 6', () => {
  const p = plan({});
  assert.equal(p.days.length, 6);
  const levels = p.days.map((d) => d.level).sort();
  assert.deepEqual(levels, ['B1', 'B1', 'B1', 'B1', 'B2', 'argot']);
  assert.equal(new Set(p.days.map((d) => d.idiom_id)).size, 6);
  assert.deepEqual(p.review, p.days.map((d) => d.entry_id));
});

test('unseen entries come first, then the ones seen longest ago', () => {
  const shown = {
    b1a: { last_shown: '2026-01-05' }, b1b: { last_shown: '2026-01-06' }, b1c: { last_shown: '2026-01-07' },
    b1d: { last_shown: '2026-01-08' }, b1e: { last_shown: '2025-06-01' }, b2a: { last_shown: '2026-01-09' }
  };
  const ids = plan({ shown }).days.map((d) => d.entry_id).sort();
  assert.deepEqual(ids, ['arga', 'b1e', 'b1f', 'b1g', 'b1h', 'b2b'].sort());
  const allSeen = Object.fromEntries(ENTRIES.map((e, i) => [e.id, { last_shown: '2026-02-' + String(10 + i).padStart(2, '0') }]));
  assert.deepEqual(plan({ shown: allSeen }).days.map((d) => d.entry_id).sort(), ['arga', 'b1a', 'b1b', 'b1c', 'b1d', 'b2a'].sort());
});

test('the order is shuffled, the same every time for a week, and different across weeks', () => {
  assert.deepEqual(plan({}), plan({}));
  const orders = new Set(['2027-03-01', '2027-03-08', '2027-03-15', '2027-03-22', '2027-03-29']
    .map((w) => plan({ weekStart: w }).days.map((d) => d.level).join(',')));
  assert.ok(orders.size > 1);
});

test('a short level is topped up from the other entries', () => {
  const p = plan({ entries: ENTRIES.filter((e) => e.level !== 'B2') });
  assert.equal(p.days.length, 6);
});

// ---- The real library -------------------------------------------------------------------------

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../content', f), 'utf8'));
function realLibrary() {
  const files = read('library/INDEX.json').files.map((f) => read('library/' + f));
  return { themes: read('themes.json'), calendar: read('default_calendar.json'), keywords: read('keywords.json'),
           entries: files.flatMap((f) => f.entries), idioms: files.flatMap((f) => f.idioms) };
}

test('the complete themes are exactly the ones in COMPLETE.txt', () => {
  const done = fs.readFileSync(path.join(__dirname, '../content/library/COMPLETE.txt'), 'utf8').split(/\s+/).filter(Boolean).sort();
  assert.deepEqual([...E.completeTags_(realLibrary())].sort(), done);
});

test('with the real library, this week is Les soldes and its plan has the right mix', () => {
  const lib = realLibrary();
  const c = plain(E.chooseTheme_({ weekStart: '2026-11-23', lib, history: [], events: [], available: E.completeTags_(lib) }));
  assert.equal(c.tag, 'seasonal.sales');
  const p = plain(E.planWeek_({ weekStart: '2026-11-23', tag: c.tag, shown: {},
    entries: lib.entries.filter((e) => e.theme === c.tag), idioms: lib.idioms.filter((i) => i.theme === c.tag) }));
  assert.deepEqual(p.days.map((d) => d.level).sort(), ['B1', 'B1', 'B1', 'B1', 'B2', 'argot']);
});

test('"Holiday party" is a social event, and New Year’s Eve is the year review', () => {
  const lib = realLibrary();
  const at = (title) => plain(E.chooseTheme_({ weekStart: '2027-03-01', lib, history: [], events: [{ title, start: '2027-03-10' }] }));
  assert.equal(at('Holiday party at the office').tag.split('.')[0], 'social');
  assert.equal(at("New Year's Eve at Sam's").tag, 'seasonal.year_review');
});
