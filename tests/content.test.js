// Run with: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load the pure part of apps-script/Content.js into a sandbox.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Content.js'), 'utf8'), ctx);
const { validateLibrary_, entryToRow_, rowToEntry_, themeToRow_, rowToTheme_, lemma_ } = ctx;

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../content', f), 'utf8'));
const library = () => ({
  themes: read('themes.json'),
  calendar: read('default_calendar.json'),
  keywords: read('keywords.json'),
  entries: read('entries.json')
});
const clone = (x) => JSON.parse(JSON.stringify(x));

test('the content in the repo has no errors', () => {
  const res = validateLibrary_(library(), {});
  assert.deepEqual([...res.errors], []);
});

test('the sample entries have no warnings', () => {
  assert.deepEqual([...validateLibrary_(library(), {}).warnings], []);
});

test('there are 65 themes covering the spec tags', () => {
  const themes = read('themes.json');
  assert.equal(themes.length, 65);
  const perCat = {};
  themes.forEach((t) => { perCat[t.category] = (perCat[t.category] || 0) + 1; });
  assert.deepEqual(perCat, { travel: 10, social: 10, errands: 10, work: 10, daily: 10, seasonal: 15 });
});

test('an entry survives a trip through a Sheet row', () => {
  for (const e of read('entries.json')) {
    const back = rowToEntry_(entryToRow_(e));
    assert.deepEqual(JSON.parse(JSON.stringify(back)), { ...e, tts: e.tts || null });
  }
});

test('a theme survives a trip through a Sheet row', () => {
  const t = read('themes.json')[0];
  assert.deepEqual(JSON.parse(JSON.stringify(rowToTheme_(themeToRow_(t)))), t);
});

test('lemma drops the article', () => {
  assert.equal(lemma_("l'ordre du jour"), 'ordre du jour');
  assert.equal(lemma_('une carie'), 'carie');
  assert.equal(lemma_('se dépêcher'), 'dépêcher');
  assert.equal(lemma_('dépensier'), 'dépensier');
});

test('a word used twice is an error, with or without its article', () => {
  const lib = library();
  const dup = clone(lib.entries[1]);
  dup.id = 'errands.dentist.02';
  dup.word = 'la carie';
  lib.entries.push(dup);
  assert.ok(validateLibrary_(lib).errors.some((m) => m.includes('already used')));
});

test('a phrase missing from dialogue lines 1–2 is an error', () => {
  const lib = library();
  lib.entries[0].phrase_fr = 'Où est la porte B12 ?';
  assert.ok(validateLibrary_(lib).errors.some((m) => m.includes('dialogue line 1 or 2')));
});

test('a register without tu/vous is an error', () => {
  const lib = library();
  lib.entries[0].register = 'poli';
  assert.ok(validateLibrary_(lib).errors.some((m) => m.includes('"tu" or "vous"')));
});

test('a missing field is an error', () => {
  const lib = library();
  lib.entries[0].def_en = '';
  assert.ok(validateLibrary_(lib).errors.some((m) => m.includes('missing def_en')));
});

test('more than 14 entries in a theme is an error', () => {
  const lib = library();
  for (let i = 2; i <= 15; i++) {
    const e = clone(lib.entries[1]);
    e.id = 'errands.dentist.' + String(i).padStart(2, '0');
    e.word = 'mot' + i;
    lib.entries.push(e);
  }
  assert.ok(validateLibrary_(lib).errors.some((m) => m.includes('15 entries (max 14)')));
});

test('complete mode requires at least 10 entries per theme', () => {
  const res = validateLibrary_(library(), { complete: true });
  assert.ok(res.errors.some((m) => m.includes('travel.airport: 1 entries (min 10)')));
});

test('unknown related tags and missing weeks are errors', () => {
  const lib = library();
  lib.themes[0].related = ['travel.moon'];
  delete lib.calendar['53'];
  const errs = validateLibrary_(lib).errors;
  assert.ok(errs.some((m) => m.includes('travel.moon does not exist')));
  assert.ok(errs.some((m) => m.includes('week 53 is missing')));
});

test('a keyword pointing nowhere is an error', () => {
  const lib = library();
  lib.keywords.push(['zeppelin', 'travel.airship']);
  assert.ok(validateLibrary_(lib).errors.some((m) => m.includes('zeppelin')));
});

test('every default week has a usable even-year swap (its first related tag)', () => {
  const lib = library();
  const byTag = Object.fromEntries(lib.themes.map((t) => [t.tag, t]));
  for (const tag of Object.values(lib.calendar)) assert.ok(byTag[byTag[tag].related[0]]);
});
