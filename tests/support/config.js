// tests/support/config.js
//
// Everything environment- or org-specific comes from the environment, so the repo carries
// no hostnames, logins or partner names. Copy .env.example to .env and fill it in.

// Lets a local .env populate process.env. Optional on purpose: in CI the variables are
// set directly and dotenv need not be installed.
try {
  require('dotenv').config();
} catch {
  /* dotenv not installed — plain environment variables still work */
}

const path = require('path');

/** Read a required variable, failing with a message that says how to fix it. */
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

const TESTS_DIR = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const BASE_URL = required('BASE_URL');

const USERS = {
  onboardingSpecialist: {
    email: required('ONBOARDING_EMAIL'),
    password: required('ONBOARDING_PASSWORD'),
  },
  trainer: {
    email: required('TRAINER_EMAIL'),
    password: required('TRAINER_PASSWORD'),
  },
};

// Reporting manager + team leader on every bulk row.
const MANAGER_EMAIL = required('MANAGER_EMAIL');

// The two manager fields are found by their placeholder, which the app renders as
// "name@<your company domain>". Derived from MANAGER_EMAIL so it needs no second
// variable, but overridable for an instance whose placeholder says something else.
const MANAGER_FIELD_PLACEHOLDER = optional(
  'MANAGER_FIELD_PLACEHOLDER',
  `name@${MANAGER_EMAIL.split('@').pop()}`
);

// A freshly onboarded trainee signs in with the email the platform mints for them
// (scraped off the batch table in the trainer phase), using a temporary password, and is
// forced to set a new one on first login.
const TRAINEE_TEMP_PASSWORD = required('TRAINEE_TEMP_PASSWORD');

// The domain the platform mints trainee logins on — used to pick the address out of the
// trainee's row in the batch table.
const TRAINEE_EMAIL_DOMAIN = required('TRAINEE_EMAIL_DOMAIN');

// Years to draw trainee passwords from — plausible birth years, same as the older specs.
const PASSWORD_YEARS = { min: 1970, max: 2005 };

// The batch is named "<Partner> <Location> <Module> <Batch No.>". PARTNER_OPTION and
// LOCATION_OPTION are the exact dropdown option labels, codes included; the display name
// drops the bracketed codes.
const PARTNER_OPTION = required('PARTNER_OPTION');
const LOCATION_OPTION = required('LOCATION_OPTION');
const MODULE_OPTION = optional('MODULE_OPTION', 'Offline'); // the Group (cohort) value

// Batch numbers are free-text and the dev env is full of old batches, so the onboarding
// phase picks a number from this range that no existing batch is using — two batches with
// the same name would make every later lookup ambiguous.
const BATCH_NO_RANGE = {
  min: Number(optional('BATCH_NO_MIN', 100)),
  max: Number(optional('BATCH_NO_MAX', 999)),
};

const TRAINEE_COUNT = Number(optional('TRAINEE_COUNT', 5));

// Safety caps, so a stuck stepper / deck / walkthrough fails fast instead of eating the
// whole test budget.
const LIMITS = {
  MAX_DAY_STEPS: 60,          // schedule review stepper
  // Skip clicks: the tour is a handful of stacked steps, but the trainer's batch popup
  // has one Skip per batch they're running — so this has to cover a busy trainer, not
  // just the tour. Raise it if the warning in dismissWalkthrough ever fires.
  MAX_SKIP_CLICKS: 25,
  WALKTHROUGH_BUDGET: 60000,  // wall-clock cap on dismissing the walkthrough
  MAX_TRAINING_STEPS: 12,     // resources to walk before giving up on reaching a test
  MAX_DECK_PAGES: 60,         // slides in one deck
  MAX_PASSWORD_ATTEMPTS: 5,   // tries at a password no other user has taken
  MAX_BATCH_NO_TRIES: 15,     // tries at an unused batch number
  MAX_SUBMIT_CLICKS: 3,       // re-clicks when a popover swallows the submit
};

const TIMEOUTS = {
  REVIEW_GATE: 240000, // "Review first (116s)" plus room for a slow render
  NAV: 30000,
  LIST: 20000,
  DIALOG: 15000,
  BRANCH: 60000,       // waiting on whichever of two screens arrives
};

const PHASE_TIMEOUTS = {
  ONBOARDING: 6 * 60 * 1000, // the day-by-day schedule review is slow
  TRAINER: 5 * 60 * 1000,    // includes up to a minute of clearing the batch popup
  TRAINEE_LOGIN: 4 * 60 * 1000,
  TRAINEE_TRAINING: 15 * 60 * 1000, // two ~2-minute "Review first" gates
};

const PATHS = {
  CSV: path.join(TESTS_DIR, 'test-data', 'bulk.csv'),
  RUN_FILE: path.join(TESTS_DIR, 'test-data', 'last-run.json'),
  CREDENTIALS: path.join(PROJECT_ROOT, 'credentials.txt'),
};

const CSV_HEADERS = [
  'Emp Name(First name & Last Name as per Govt ID)',
  'phone_number',
  'Role',
  'type',
  'regional_language',
  'employee_id',
  'Gender(Male/Female)',
  'Versant Score',
  'Versant TIN',
  'Date of Birth(DD-MM-YY)',
];

const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada'];

module.exports = {
  TESTS_DIR,
  PROJECT_ROOT,
  BASE_URL,
  USERS,
  MANAGER_EMAIL,
  MANAGER_FIELD_PLACEHOLDER,
  TRAINEE_TEMP_PASSWORD,
  TRAINEE_EMAIL_DOMAIN,
  PASSWORD_YEARS,
  PARTNER_OPTION,
  LOCATION_OPTION,
  MODULE_OPTION,
  BATCH_NO_RANGE,
  TRAINEE_COUNT,
  LIMITS,
  TIMEOUTS,
  PHASE_TIMEOUTS,
  PATHS,
  CSV_HEADERS,
  LANGUAGES,
};