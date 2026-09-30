// tests/mool-end-to-end.spec.js
//
// The Mool Health counterpart of end-to-end.spec.js, two phases run in order:
//   1. Bulk-onboard N outsource trainees in the Mool Health workspace -> creates a batch
//   2. Sign in to Starfleet and open User -> User List
//
// Serial, so Starfleet is skipped when onboarding fails. Both phases use the MOOL_EMAIL /
// MOOL_PASSWORD login from .env, each in its own browser context.
//
// Run:  npx playwright test tests/mool-end-to-end.spec.js --project=chromium --headed

const { test } = require('@playwright/test');

const { PHASE_TIMEOUTS } = require('./support/config');
const { MOOL_PHASE_TIMEOUTS } = require('./support/mool.config');
const { moolFlow } = require('./support/mool.state');
const { withFreshContext } = require('./support/session');

const { moolBulkOnboardTrainees, openStarfleetUserList } = require('./flows/mool.flow');

test.describe.configure({ mode: 'serial' });

test.describe('Mool Health Academy', () => {

  test('Onboarding Specialist does Bulk Onboarding in Mool Health', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.ONBOARDING);
    await withFreshContext(browser, (page) => moolBulkOnboardTrainees(page, moolFlow));
  });

  test('Admin opens User List in Starfleet', async ({ browser }) => {
    test.setTimeout(MOOL_PHASE_TIMEOUTS.STARFLEET);
    await withFreshContext(browser, (page) => openStarfleetUserList(page));
  });
});
