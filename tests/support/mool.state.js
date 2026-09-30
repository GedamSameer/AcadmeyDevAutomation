// tests/support/mool.state.js
//
// The Mool run's handoff, kept apart from state.js so it never clobbers the Traya
// last-run.json. Env vars win, same as there.

const fs = require('fs');
const path = require('path');

const { stripCode } = require('./naming');
const { MOOL_PARTNER_OPTION, MOOL_LOCATION_OPTION, MOOL_MODULE_OPTION, MOOL_PATHS } =
  require('./mool.config');

/** "Tata 1 Mg Bangalore PC 85" */
const moolBatchNameFor = (batchNo) =>
  [stripCode(MOOL_PARTNER_OPTION), stripCode(MOOL_LOCATION_OPTION), MOOL_MODULE_OPTION, batchNo]
    .join(' ');

const moolFlow = {
  batchNo: null,
  batchName: process.env.MOOL_BATCH_NAME || null,
  batchCode: process.env.MOOL_BATCH_CODE || null,
};

function saveMoolRun() {
  fs.mkdirSync(path.dirname(MOOL_PATHS.RUN_FILE), { recursive: true });
  fs.writeFileSync(MOOL_PATHS.RUN_FILE, JSON.stringify(moolFlow, null, 2));
}

module.exports = { moolFlow, saveMoolRun, moolBatchNameFor };
