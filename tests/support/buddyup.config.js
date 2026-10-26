// tests/support/buddyup.config.js
//
// Settings for the Buddy Up run (tests/buddy-up.spec.js). Sits beside config.js rather than
// inside it so the Traya suite is untouched; everything shared (base URL, staff logins,
// caps, timeouts, CSV shape) still comes from config.js. Same rule as there: nothing
// org-specific is hardcoded — it all comes from .env.

const path = require('path');

const { TESTS_DIR } = require('./config');

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env and fill it in, ` +
      `or export ${name} before running Playwright.`
    );
  }
  return value.trim();
}

const optional = (name, fallback) => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
};

// The two roles this run adds on top of the onboarding specialist and trainer.
const BUDDY_USERS = {
  academyAdmin: {
    email: required('ACADEMY_ADMIN_EMAIL'),
    password: required('ACADEMY_ADMIN_PASSWORD'),
  },
  qa: {
    email: required('QA_EMAIL'),
    password: required('QA_PASSWORD'),
  },
};

// How many of the bulk rows go in as Staff Support rather than Trainee, and how many
// people the trainer adds through the Upload CSV tab.
const STAFF_SUPPORT_COUNT = Number(optional('STAFF_SUPPORT_COUNT', 1));
const CSV_ADD_COUNT = Number(optional('CSV_ADD_COUNT', 2));

// The CMS module downloaded and re-uploaded as a new one.
const CMS_SOURCE_MODULE = optional('CMS_SOURCE_MODULE', 'Offline');

// Separate files from the Traya run, so the two specs can run side by side without
// overwriting each other's CSVs or handoff state.
const BUDDY_PATHS = {
  BULK_CSV: path.join(TESTS_DIR, 'test-data', 'buddy-bulk.csv'),
  ADD_CSV: path.join(TESTS_DIR, 'test-data', 'buddy-add.csv'),
  DOWNLOADS: path.join(TESTS_DIR, 'test-data', 'downloads'),
  RUN_FILE: path.join(TESTS_DIR, 'test-data', 'buddy-last-run.json'),
};

const BUDDY_TIMEOUTS = {
  // Upload CSV onboards in the background and the dialog closes itself; the rows can take
  // a while to show up in the batch after that.
  CSV_ONBOARD: 2 * 60 * 1000,
  CALL_CONNECT: 60 * 1000,
};

const BUDDY_PHASE_TIMEOUTS = {
  CMS: 4 * 60 * 1000,
  BUDDY_UP: 12 * 60 * 1000,
};

module.exports = {
  BUDDY_USERS,
  STAFF_SUPPORT_COUNT,
  CSV_ADD_COUNT,
  CMS_SOURCE_MODULE,
  BUDDY_PATHS,
  BUDDY_TIMEOUTS,
  BUDDY_PHASE_TIMEOUTS,
};
