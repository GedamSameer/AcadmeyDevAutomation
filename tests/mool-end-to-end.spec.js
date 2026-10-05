// tests/mool-end-to-end.spec.js
//
// The Mool Health counterpart of end-to-end.spec.js — one flow, three phases, run in order:
//   1. Onboarding specialist bulk-onboards N outsource trainees  -> creates a batch
//   2. Trainer opens that same batch, adds one more trainee by hand, starts the batch
//   3. That trainee does first-time login (temp password -> new password) and starts training
//
// Same page objects as Traya, entered through the Mool Health workspace tile. Each phase
// gets its own browser context, and the block is serial, so a failed phase skips the
// ones that depend on it. Logins come from MOOL_ONBOARDING_* / MOOL_TRAINER_* in .env.
//
// Run:  npx playwright test tests/mool-end-to-end.spec.js --project=chromium --headed
//
// Every phase publishes what the next one needs to tests/test-data/mool-last-run.json, and
// reads its own inputs from env first, so a phase can be re-run on its own:
//   MOOL_BATCH_NAME="Tata 1 Mg Bangalore PC 499" MOOL_BATCH_CODE=RT93VM \
//     npx playwright test tests/mool-end-to-end.spec.js -g "Trainer"

const { test } = require('@playwright/test');

const { PHASE_TIMEOUTS } = require('./support/config');
const { moolFlow } = require('./support/mool.state');
const { withFreshContext } = require('./support/session');

const {
  moolBulkOnboardTrainees,
  moolAddTraineeAndStartBatch,
  moolTraineeJoinsBatch,
} = require('./flows/mool.flow');
const { traineeWorksThroughDayOne } = require('./flows/trainee.flow');

test.describe.configure({ mode: 'serial' });

test.describe('Mool Health Academy', () => {

  test('Onboarding Specialist does Bulk Onboarding in Mool Health', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.ONBOARDING);
    await withFreshContext(browser, (page) => moolBulkOnboardTrainees(page, moolFlow));
  });

  test('Trainer Adds a Trainee and Starts batch in Mool Health', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.TRAINER);
    await withFreshContext(browser, (page) => moolAddTraineeAndStartBatch(page, moolFlow));
  });

  test('Trainee Logins and takes Training in Mool Health', async ({ browser }) => {
    test.setTimeout(PHASE_TIMEOUTS.TRAINEE_LOGIN);

    await withFreshContext(browser, async (page) => {
      const training = await moolTraineeJoinsBatch(page, moolFlow);

      // Raised once logged in — the two ~2-minute "Review first" gates outlast the login budget.
      test.setTimeout(PHASE_TIMEOUTS.TRAINEE_TRAINING);

      await traineeWorksThroughDayOne(training, moolFlow);
    });
  });
});
