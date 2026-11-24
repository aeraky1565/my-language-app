// importNewContent() against a fake Sheet and a fake GitHub (no network).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LIB = path.join(__dirname, '../content/library');

function fakeSheet(rows) {
  return {
    rows,
    getDataRange() { return { getValues: () => this.rows.map((r) => r.slice()) }; },
    getLastRow() { return this.rows.length; },
    getRange(row, col, n, w) {
      const sh = this;
      return {
        setNumberFormat() { return this; },
        setValues(v) { assert.equal(row, sh.rows.length + 1); assert.equal(v.length, n); v.forEach((r) => sh.rows.push(r)); return this; }
      };
    }
  };
}

function load(sheets) {
  const fetched = [];
  const ctx = {
    UrlFetchApp: {
      fetch(url) {
        fetched.push(url);
        const name = decodeURIComponent(url.split('/').pop());
        return { getContentText: () => fs.readFileSync(path.join(LIB, name), 'utf8') };
      }
    },
    Logger: { log() {} },
    sheet_: (name) => sheets[name]
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Content.js'), 'utf8'), ctx);
  ctx.validateContent = () => ({ errors: [] });   // the validator has its own tests
  return { ctx, fetched };
}

test('import adds only ids that are not in the Sheet, and keeps existing rows untouched', () => {
  const handEdited = ['seasonal.sales.01', 'seasonal.sales', 'B1', 'dépensier (edited by hand)'];
  const sheets = {
    Entries: fakeSheet([['id', 'theme'], handEdited]),
    Idioms: fakeSheet([['id', 'theme'], ['seasonal.sales.i01', 'seasonal.sales', 'kept']])
  };
  const { ctx, fetched } = load(sheets);
  ctx.importNewContent();

  const files = JSON.parse(fs.readFileSync(path.join(LIB, 'INDEX.json'), 'utf8')).files;
  const all = files.map((f) => JSON.parse(fs.readFileSync(path.join(LIB, f), 'utf8')));
  const nEntries = all.reduce((n, f) => n + f.entries.length, 0);
  const nIdioms = all.reduce((n, f) => n + f.idioms.length, 0);

  assert.equal(fetched.length, files.length + 1);                 // the index, then each file
  assert.deepEqual(sheets.Entries.rows[1], handEdited);           // untouched
  assert.equal(sheets.Entries.rows.length, 1 + 1 + nEntries - 1); // header + kept + all but the kept one
  assert.equal(sheets.Idioms.rows.length, 1 + 1 + nIdioms - 1);
  const ids = sheets.Entries.rows.slice(1).map((r) => r[0]);
  assert.equal(new Set(ids).size, ids.length);                     // no duplicates

  // A second run adds nothing.
  const before = sheets.Entries.rows.length;
  ctx.importNewContent();
  assert.equal(sheets.Entries.rows.length, before);
});
