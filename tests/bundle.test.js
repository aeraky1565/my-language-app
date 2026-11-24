// dist/ELISE.gs (the one-file paste for the Apps Script editor) must match apps-script/.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { bundle } = require('../scripts/bundle-apps-script.js');

test('dist/ELISE.gs is up to date (run: node scripts/bundle-apps-script.js)', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '../dist/ELISE.gs'), 'utf8'), bundle());
});
