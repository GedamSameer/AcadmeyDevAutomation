// tests/support/mool.config.js
//
// Mool Health workspace + Starfleet settings. Sits beside config.js rather than inside it
// so the Traya suite is untouched; everything shared (base URL, caps, timeouts, CSV
// shape) still comes from config.js. Same rule as there: nothing org-specific is
// hardcoded — it all comes from .env.

const path = require('path');

const { TESTS_DIR, MANAGER_EMAIL } = require('./config');

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

// The Starfleet admin login.
const MOOL_USER = {
  email: required('MOOL_EMAIL'),
  password: required('MOOL_PASSWORD'),
};

// The two staff roles in the Mool Health workspace — same people as Traya, but Mool
// accounts carry their own password.
const MOOL_USERS = {
  onboardingSpecialist: {
    email: required('MOOL_ONBOARDING_EMAIL'),
    password: required('MOOL_ONBOARDING_PASSWORD'),
  },
  trainer: {
    email: required('MOOL_TRAINER_EMAIL'),
    password: required('MOOL_TRAINER_PASSWORD'),
  },
};

// Domain Mool mints trainee logins on. Unset, the trainer phase takes the first email
// address in the trainee's row instead.
const MOOL_TRAINEE_EMAIL_DOMAIN = optional('MOOL_TRAINEE_EMAIL_DOMAIN', null);

// Mool's onboarding dropdowns carry a different partner / location / cohort than Traya's.
const MOOL_PARTNER_OPTION = required('MOOL_PARTNER_OPTION');
const MOOL_LOCATION_OPTION = required('MOOL_LOCATION_OPTION');
const MOOL_MODULE_OPTION = required('MOOL_MODULE_OPTION');

// Must resolve to a CRM user from inside the Mool workspace. Falls back to the Traya one.
const MOOL_MANAGER_EMAIL = optional('MOOL_MANAGER_EMAIL', MANAGER_EMAIL);

// Root of the Starfleet admin app. Staff sign in through the "external employee" form —
// the default sign-in page is Google SSO only.
const STARFLEET_URL = required('STARFLEET_URL');

// Separate files from the Traya run, so the two specs can run side by side without
// overwriting each other's CSV or handoff state.
const MOOL_PATHS = {
  CSV: path.join(TESTS_DIR, 'test-data', 'mool-bulk.csv'),
  RUN_FILE: path.join(TESTS_DIR, 'test-data', 'mool-last-run.json'),
};

const MOOL_TIMEOUTS = {
  // accounts are created in files of 50 after Onboard — a five-person batch has taken 30s+
  ONBOARD_SUMMARY: 3 * 60 * 1000,
};

const MOOL_PHASE_TIMEOUTS = {
  STARFLEET: 2 * 60 * 1000,
};

module.exports = {
  MOOL_USER,
  MOOL_USERS,
  MOOL_TRAINEE_EMAIL_DOMAIN,
  MOOL_PARTNER_OPTION,
  MOOL_LOCATION_OPTION,
  MOOL_MODULE_OPTION,
  MOOL_MANAGER_EMAIL,
  STARFLEET_URL,
  MOOL_PATHS,
  MOOL_TIMEOUTS,
  MOOL_PHASE_TIMEOUTS,
};
