// tests/flows/trainer.flow.js
//
// Phase 2 — the trainer opens the batch phase 1 created, adds one more trainee by hand,
// and starts the batch.

const { expect } = require('@playwright/test');

const { USERS, TRAINEE_COUNT, TRAINEE_EMAIL_DOMAIN, TIMEOUTS } = require('../support/config');
const { escapeRegExp } = require('../support/naming');
const { makeFormTrainee } = require('../support/data');
const { saveRun } = require('../support/state');
const { LoginPage } = require('../pages/LoginPage');
const { BatchManagementPage } = require('../pages/BatchManagementPage');

/**
 * Publishes the hand-added trainee (including the login email the platform mints) onto
 * `flow`, and leaves the batch Ongoing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function addTraineeAndStartBatch(page, flow, { expectedExisting = TRAINEE_COUNT } = {}) {
  expect(flow.batchName, 'batch name from the bulk phase').toBeTruthy();

  const login = new LoginPage(page);
  const batches = new BatchManagementPage(page);
  const trainee = makeFormTrainee();

  await login.login(USERS.trainer);
  await batches.goto();
  const card = await batches.openBatch(flow.batchName);

  // How many trainees the bulk phase put here — the form should add exactly one more.
  const before = await batches.activeCount();
  expect(before, 'trainees created by the bulk phase').toBe(expectedExisting);

  const dialog = await batches.openAddTraineeDialog(flow.batchName);
  await dialog.fill(trainee);
  await dialog.submit();

  // The list is cached client-side; re-selecting the batch refetches it. Fall back to a
  // reload (which resets the pane to the default batch, so re-open afterwards).
  await card.click();
  const row = batches.traineeRow(trainee.fullName);
  if (!(await row.isVisible({ timeout: TIMEOUTS.DIALOG }).catch(() => false))) {
    await page.reload({ waitUntil: 'networkidle' });
    await batches.openBatch(flow.batchName);
  }

  await expect(row, `${trainee.fullName} in batch "${flow.batchName}"`)
    .toBeVisible({ timeout: TIMEOUTS.NAV });
  await expect(batches.activeTab).toHaveText(`Active (${before + 1})`);

  // The platform mints the login email (employee ID + partner code + location code) and
  // prints it in the Email column — read it rather than deriving it.
  const rowText = await row.innerText();
  const mintedEmail = new RegExp(`[\\w.+-]+@${escapeRegExp(TRAINEE_EMAIL_DOMAIN)}`);
  trainee.email = (rowText.match(mintedEmail) || [])[0] || null;
  expect(trainee.email, `minted login email in ${trainee.fullName}'s row`).toBeTruthy();

  // Kick the batch off — the trainee can't do any training until it's started.
  await batches.startBatch();
  await expect(card).toContainText('Ongoing', { timeout: TIMEOUTS.LIST });

  // The code is minted with the batch, but re-read it in case this phase ran standalone.
  flow.batchCode = flow.batchCode || (await batches.readBatchCode(card));
  flow.trainee = trainee;
  saveRun();

  console.log(
    `Added ${trainee.fullName} (${trainee.email}) to batch "${flow.batchName}" ` +
    `and started it — batch code ${flow.batchCode || 'NOT FOUND'}`
  );

  return trainee;
}

module.exports = { addTraineeAndStartBatch };