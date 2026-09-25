// tests/flows/trainee.flow.js
//
// Phase 3 — the trainee the trainer just added does a first-time login (temp password ->
// new password), joins the batch with its code, and works through Day 1 until a test is
// available.

const { expect } = require('@playwright/test');

const { LIMITS } = require('../support/config');
const { saveRun, saveCredentials } = require('../support/state');
const { LoginPage } = require('../pages/LoginPage');
const { TrainingPage } = require('../pages/TrainingPage');

/**
 * First login + the join gate. The password the platform accepts is written to
 * last-run.json and credentials.txt the moment it sticks, so a crash later in the day
 * doesn't lose the account.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function traineeJoinsBatch(page, flow) {
  expect(flow.trainee?.email, 'trainee email from the add-trainee phase').toBeTruthy();
  expect(flow.batchCode, 'batch code from the batch card').toBeTruthy();

  const login = new LoginPage(page);
  const training = new TrainingPage(page);

  await login.loginAsTrainee(flow.trainee, {
    onPasswordSet: (password) => {
      saveRun();
      saveCredentials({
        batchName: flow.batchName,
        batchCode: flow.batchCode,
        username: flow.trainee.fullName,
        email: flow.trainee.email,
        password,
      });
    },
  });

  await training.joinBatch(flow.batchCode);
  console.log(`${flow.trainee.email} joined "${flow.batchName}" and started training`);

  return training;
}

/**
 * Day 1 itself. The ask is whether the test is *available* — so this checks it and stops
 * there, rather than sitting the test.
 *
 * @param {TrainingPage} training
 * @param {object} flow
 */
async function traineeWorksThroughDayOne(training, flow) {
  const startTest = await training.workThroughTraining();
  expect(startTest, `a test within ${LIMITS.MAX_TRAINING_STEPS} resources`).not.toBeNull();

  await expect(startTest, 'Start test button').toBeVisible();
  await expect(startTest, 'Start test button').toBeEnabled();
  console.log(
    `Start test is available for ${flow.trainee.email} — stopping before the test`
  );

  return startTest;
}

module.exports = { traineeJoinsBatch, traineeWorksThroughDayOne };