// tests/end-to-end.spec.js
//
// One end-to-end flow, three phases, run in order:
//   1. Onboarding specialist bulk-onboards N outsource trainees  -> creates a batch
//   2. Trainer opens that same batch, adds one more trainee by hand, starts the batch
//   3. That trainee does first-time login (temp password -> new password) and starts training
//
// Each phase lives in its own file under tests/flows/ and drives the page objects in
// tests/pages/. Each gets its own browser context, so the three roles never share a
// session (no logout steps needed). The describe block is serial: if a phase fails, the
// phases that depend on its output are skipped rather than failing noisily.
//
// Run:  npx playwright test tests/end-to-end.spec.js --project=chromium --headed
//
// Every phase publishes what the next one needs to tests/test-data/last-run.json, and
// reads its own inputs from env first, so a phase can be re-run on its own:
//   BATCH_NAME="Example Partner Example City Offline 85" BATCH_CODE=2REX9J npx playwright test -g "trainer adds"

const { test } = require('@playwright/test');

const { PHASE_TIMEOUTS } = require('./support/config');
const { flow } = require('./support/state');
const { withFreshContext } = require('./support/session');

const { bulkOnboardTrainees } = require('./flows/onboarding.flow');
const { addTraineeAndStartBatch } = require('./flows/trainer.flow');
const { traineeJoinsBatch, traineeWorksThroughDayOne } = require('./flows/trainee.flow');

test.describe.configure({ mode: 'serial' });

test.describe('Traya Academy', () => {

  test('Onboarding Specialist does Bulk Onboarding', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.ONBOARDING);
    await withFreshContext(browser, (page) => bulkOnboardTrainees(page, flow));
  });

  test('Trainer Adds a Trainee and Starts batch', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.TRAINER);
    await withFreshContext(browser, (page) => addTraineeAndStartBatch(page, flow));
  });

  test('Trainee Logins and takes Training', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.TRAINEE_LOGIN);

    await withFreshContext(browser, async (page) => {
      const training = await traineeJoinsBatch(page, flow);

      // Raised here rather than at the top of the test: the two "Review first" gates are
      // ~2 minutes each, so the reading alone outlasts the login budget. The later call
      // is the one that counts.
      test.setTimeout(PHASE_TIMEOUTS.TRAINEE_TRAINING);

      await traineeWorksThroughDayOne(training, flow);
    });
  });
});