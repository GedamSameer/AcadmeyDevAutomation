// tests/buddy-up.spec.js
//
// One end-to-end flow, five phases, run in order:
//   1. Onboarding specialist bulk-onboards an Offline batch with Staff Support rows, and
//      checks after a refresh that everyone landed and Staff Support shows as such
//   2. Trainer adds a trainee by hand and more by CSV (each checked after a refresh),
//      changes a Staff Support to Trainee from their profile, and starts the batch
//   3. A trainee logs in and trains up to the Spoken English assessment
//   4. Academy admin: CMS download -> new module, CMS v2 Directories, every Config & Bank tab
//   5. QA runs the Buddy Up call with a trainee: both join, both switch Split / Meeting /
//      Form-or-CRM views without the call reconnecting, QA fills and submits the feedback,
//      QA sees the evaluation result and the trainee sees the Buddy Up completed
//
// Each phase lives in tests/flows/buddyup.flow.js and gets its own browser context, so the
// roles never share a session. The describe block is serial: if a phase fails, the phases
// that depend on its output are skipped. The CMS phase depends on nothing and is safe to
// run alone with -g "Academy Admin".
//
// Run:  npx playwright test tests/buddy-up.spec.js --project=chromium --headed
//
// Every phase publishes what the next one needs to tests/test-data/buddy-last-run.json.

const { test } = require('@playwright/test');

const { PHASE_TIMEOUTS } = require('./support/config');
const { BUDDY_PHASE_TIMEOUTS } = require('./support/buddyup.config');
const { buddyFlow } = require('./support/buddyup.state');
const { withFreshContext } = require('./support/session');

const {
  onboardBatchWithStaffSupport,
  trainerAddsTraineesAndStartsBatch,
  traineeTrainsUntilSpokenEnglish,
  adminChecksCms,
} = require('./flows/buddyup.flow');
const { qaBuddyUpCall } = require('./flows/buddyup.call.flow');

test.describe.configure({ mode: 'serial' });

// The Buddy Up call asks for a camera and microphone. Chromium's fake devices answer that
// prompt with a test pattern, so both sides can join on a machine with neither.
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

test.describe('Traya Academy — Buddy Up', () => {

  test('Onboarding Specialist onboards an Offline batch with Staff Support', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.ONBOARDING);
    await withFreshContext(browser, (page) => onboardBatchWithStaffSupport(page, buddyFlow));
  });

  test('Trainer adds trainees by form and CSV, changes a role, and starts the batch', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.TRAINER + 4 * 60 * 1000); // two adds, a CSV wait, a role change
    await withFreshContext(browser, (page) => trainerAddsTraineesAndStartsBatch(page, buddyFlow));
  });

  test('Trainee trains up to Spoken English', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.TRAINEE_TRAINING);
    await withFreshContext(browser, (page) => traineeTrainsUntilSpokenEnglish(page, buddyFlow));
  });

  test('Academy Admin checks CMS, CMS v2 Directories and Config & Bank', async ({ browser }) => {
    test.setTimeout(BUDDY_PHASE_TIMEOUTS.CMS);
    await withFreshContext(browser, (page) => adminChecksCms(page, buddyFlow));
  });

  test.only('QA and Trainee complete a Buddy Up call', async ({ browser }) => {
    test.setTimeout(BUDDY_PHASE_TIMEOUTS.BUDDY_UP);
    await qaBuddyUpCall(browser, buddyFlow);
  });
});
