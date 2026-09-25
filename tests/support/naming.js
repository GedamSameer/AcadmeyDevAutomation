// tests/support/naming.js
//
// Turning dropdown labels into the batch name the rest of the app displays.

const { PARTNER_OPTION, LOCATION_OPTION, MODULE_OPTION } = require('./config');

/** "Example Partner (EXP01)" -> "Example Partner" — the dropdown shows the code, the batch name doesn't. */
const stripCode = (label) => label.replace(/\s*\([^)]*\)\s*$/, '').trim();

/** "Example Partner Example City Offline 85" */
const batchNameFor = (batchNo) =>
  [stripCode(PARTNER_OPTION), stripCode(LOCATION_OPTION), MODULE_OPTION, batchNo].join(' ');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { stripCode, batchNameFor, escapeRegExp };