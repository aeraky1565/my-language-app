// Run with: node --test tests/*.test.js
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
const { validateLibrary_, entryToRow_, rowToEntry_, themeToRow_, rowToTheme_, idiomToRow_, rowToIdiom_, lemma_ } = ctx;

const CONTENT = path.join(__dirname, '../content');
const read = (f) => JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8'));
const themeFileNames = () => fs.readdirSync(path.join(CONTENT, 'library'))
  .filter((f) => f.endsWith('.json') && f !== 'INDEX.json').sort();
const libraryFiles = () => themeFileNames().map((f) => read('library/' + f));
const library = () => {
  const files = libraryFiles();
  return {
    themes: read('themes.json'),
    calendar: read('default_calendar.json'),
    keywords: read('keywords.json'),
    entries: files.flatMap((f) => f.entries),
    idioms: files.flatMap((f) => f.idioms)
  };
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const errorsOf = (lib, opts) => [...validateLibrary_(lib, opts || {}).errors];
const COMPLETE = (fs.existsSync(path.join(CONTENT, 'library/COMPLETE.txt'))
  ? fs.readFileSync(path.join(CONTENT, 'library/COMPLETE.txt'), 'utf8').split(/\s+/).filter(Boolean) : []);

// ---- The content in the repo ------------------------------------------------

test('the content in the repo has no errors', () => {
  assert.deepEqual(errorsOf(library()), []);
});

test('the content in the repo has no warnings', () => {
  assert.deepEqual([...validateLibrary_(library(), {}).warnings], []);
});

test('content/library/INDEX.json lists exactly the theme files (the Sheet importer reads it)', () => {
  assert.deepEqual(read('library/INDEX.json').files, themeFileNames());
});

test('each library file holds only its own theme', () => {
  for (const f of libraryFiles()) {
    for (const e of f.entries) assert.equal(e.theme, f.theme, e.id);
    for (const i of f.idioms) assert.equal(i.theme, f.theme, i.id);
  }
});

test('themes listed in content/library/COMPLETE.txt are complete', () => {
  const res = validateLibrary_(library(), { complete: true });
  const bad = [...res.errors].filter((m) => COMPLETE.some((t) => m.startsWith('Theme ' + t + ':')));
  assert.deepEqual(bad, []);
});

test('there are 65 themes covering the spec tags', () => {
  const themes = read('themes.json');
  assert.equal(themes.length, 65);
  const perCat = {};
  themes.forEach((t) => { perCat[t.category] = (perCat[t.category] || 0) + 1; });
  assert.deepEqual(perCat, { travel: 10, social: 10, errands: 10, work: 10, daily: 10, seasonal: 15 });
});

test('every default week has a usable even-year swap (its first related tag)', () => {
  const lib = library();
  const byTag = Object.fromEntries(lib.themes.map((t) => [t.tag, t]));
  for (const tag of Object.values(lib.calendar)) assert.ok(byTag[byTag[tag].related[0]]);
});

// ---- Rows <-> objects ---------------------------------------------------------

test('an entry survives a trip through a Sheet row', () => {
  for (const e of library().entries) {
    const back = rowToEntry_(entryToRow_(e));
    assert.deepEqual(JSON.parse(JSON.stringify(back)), { ...e, tts: e.tts || null });
  }
});

test('an idiom survives a trip through a Sheet row', () => {
  for (const i of library().idioms) assert.deepEqual(JSON.parse(JSON.stringify(rowToIdiom_(idiomToRow_(i)))), i);
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

// ---- Entry rules --------------------------------------------------------------

test('a word used twice is an error, with or without its article', () => {
  const lib = library();
  const dup = clone(lib.entries.find((e) => e.id === 'errands.dentist.01'));
  dup.id = 'errands.dentist.99';
  dup.word = 'la carie';
  lib.entries.push(dup);
  assert.ok(errorsOf(lib).some((m) => m.includes('already used')));
});

test('a phrase missing from dialogue lines 1–2 is an error', () => {
  const lib = library();
  lib.entries[0].phrase_fr = 'Où est la porte B12 ?';
  assert.ok(errorsOf(lib).some((m) => m.includes('dialogue line 1 or 2')));
});

test('a register without tu/vous is an error', () => {
  const lib = library();
  lib.entries[0].register = 'poli';
  assert.ok(errorsOf(lib).some((m) => m.includes('"tu" or "vous"')));
});

test('a missing field is an error', () => {
  const lib = library();
  lib.entries[0].def_en = '';
  assert.ok(errorsOf(lib).some((m) => m.includes('missing def_en')));
});

test('a level other than B1, B2 or argot is an error', () => {
  const lib = library();
  lib.entries[0].level = 'C1';
  assert.ok(errorsOf(lib).some((m) => m.includes('level must be B1, B2 or argot')));
});

test('more than 14 entries in a theme is an error', () => {
  const lib = library();
  const base = lib.entries.find((e) => e.id === 'errands.dentist.01');
  for (let i = 2; i <= 15; i++) {
    const e = clone(base);
    e.id = 'errands.dentist.x' + i;
    e.word = 'mot' + i;
    lib.entries.push(e);
  }
  assert.ok(errorsOf(lib).some((m) => m.includes('15 entries (max 14)')));
});

test('complete mode requires 10 entries, 2 B2, 2 argot and 6 idioms per theme', () => {
  const errs = errorsOf(library(), { complete: true });
  assert.ok(errs.includes('Theme travel.airport: 1 entries (min 10)'));
  assert.ok(errs.includes('Theme travel.airport: 0 B2 entries (min 2)'));
  assert.ok(errs.includes('Theme travel.airport: 0 argot entries (min 2)'));
  assert.ok(errs.includes('Theme travel.airport: 1 idioms (need 6)'));
});

// ---- Idiom rules ----------------------------------------------------------------

test('an idiom used twice is an error', () => {
  const lib = library();
  const dup = clone(lib.idioms[0]);
  dup.id = 'errands.dentist.i99';
  dup.theme = 'errands.dentist';
  lib.idioms.push(dup);
  assert.ok(errorsOf(lib).some((m) => m.includes('idiom "' + lib.idioms[0].fr + '" already used')));
});

test('an idiom with a missing field is an error', () => {
  const lib = library();
  lib.idioms[0].literal = '';
  assert.ok(errorsOf(lib).some((m) => m.includes('missing literal')));
});

test('more than 6 idioms in a theme is an error', () => {
  const lib = library();
  const base = lib.idioms.find((i) => i.theme === 'errands.dentist');
  for (let n = 2; n <= 7; n++) lib.idioms.push({ ...clone(base), id: 'errands.dentist.i' + (90 + n), fr: 'idiome ' + n });
  assert.ok(errorsOf(lib).some((m) => m.includes('errands.dentist: 7 idioms (max 6)')));
});

// ---- Themes, calendar, keywords ------------------------------------------------

test('unknown related tags and missing weeks are errors', () => {
  const lib = library();
  lib.themes[0].related = ['travel.moon'];
  delete lib.calendar['53'];
  const errs = errorsOf(lib);
  assert.ok(errs.some((m) => m.includes('travel.moon does not exist')));
  assert.ok(errs.some((m) => m.includes('week 53 is missing')));
});

test('a keyword pointing nowhere is an error', () => {
  const lib = library();
  lib.keywords.push(['zeppelin', 'travel.airship']);
  assert.ok(errorsOf(lib).some((m) => m.includes('zeppelin')));
});
