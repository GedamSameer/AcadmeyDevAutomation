// tests/flows/mool.flow.js
//
// The Mool Health run — the same three phases as the Traya one:
//   Phase 1 — the onboarding specialist bulk-onboards N outsource trainees -> creates a batch
//   Phase 2 — the trainer adds one more trainee by hand and starts the batch
//   Phase 3 — that trainee does first-time login, joins the batch and works through Day 1
// plus openStarfleetUserList, the Starfleet User -> User List check.

const { expect } = require('@playwright/test');

const { TRAINEE_COUNT, TIMEOUTS } = require('../support/config');
const {
  MOOL_USER,
  MOOL_USERS,
  MOOL_MODULE_OPTION,
  MOOL_MANAGER_EMAIL,
  MOOL_TRAINEE_EMAIL_DOMAIN,
  MOOL_PATHS,
} = require('../support/mool.config');
const { saveMoolRun, moolBatchNameFor } = require('../support/mool.state');
const { saveCredentials } = require('../support/state');
const { escapeRegExp } = require('../support/naming');
const { writeBulkCsv, makeFormTrainee } = require('../support/data');
const { MoolLoginPage, MoolOnboardingPage, MoolBatchManagementPage, MoolTrainingPage } =
  require('../pages/MoolPages');
const { StarfleetPage } = require('../pages/StarfleetPage');

/**
 * Publishes batchNo / batchName / batchCode onto `flow`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function moolBulkOnboardTrainees(page, flow, { count = TRAINEE_COUNT } = {}) {
  const login = new MoolLoginPage(page);
  const onboarding = new MoolOnboardingPage(page);
  const batches = new MoolBatchManagementPage(page);

  writeBulkCsv(MOOL_PATHS.CSV, count);
  await login.login(MOOL_USER);

  await batches.goto();
  const batchNo = await batches.pickFreeBatchNo();
  const batchName = moolBatchNameFor(batchNo);

  // Onboarding → Out Source
  await onboarding.goto();
  await onboarding.selectHouse('Out Source');

  await onboarding.downloadSampleSheet();
  await onboarding.uploadSheet(MOOL_PATHS.CSV);

  await onboarding.fillManagerEmails(MOOL_MANAGER_EMAIL);
  await onboarding.selectCohort(MOOL_MODULE_OPTION);
  await onboarding.reviewSchedule();
  await onboarding.selectPartnerAndLocation();
  await onboarding.pickDates();
  await onboarding.setBatchNo(batchNo);
  await onboarding.createBatch(count);

  await batches.goto();
  const card = await batches.openBatch(batchName);
  await expect(card).toContainText('Not Started');

  flow.batchNo = batchNo;
  flow.batchName = batchName;
  flow.batchCode = await batches.readBatchCode(card);
  saveMoolRun();

  expect(flow.batchCode, 'join code printed on the batch card').toBeTruthy();
  console.log(
    `Mool: bulk-onboarded ${count} trainees into batch "${batchName}" (code ${flow.batchCode})`
  );

  return flow;
}

/**
 * Phase 2 — mirrors addTraineeAndStartBatch: publishes the hand-added trainee (with the
 * login email the platform mints) onto `flow`, and leaves the batch Ongoing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function moolAddTraineeAndStartBatch(page, flow, { expectedExisting = TRAINEE_COUNT } = {}) {
  expect(flow.batchName, 'batch name from the bulk phase').toBeTruthy();

  const login = new MoolLoginPage(page);
  const batches = new MoolBatchManagementPage(page);
  const trainee = makeFormTrainee();

  await login.login(MOOL_USERS.trainer);
  await batches.goto();
  const card = await batches.openBatch(flow.batchName);

  const before = await batches.activeCount();
  expect(before, 'trainees created by the bulk phase').toBe(expectedExisting);

  const dialog = await batches.openAddTraineeDialog(flow.batchName);
  await dialog.fill(trainee);
  await dialog.submit();

  // Re-selecting the batch refetches its cached trainee list; reload if that isn't enough.
  await card.click();
  const row = batches.traineeRow(trainee.fullName);
  if (!(await row.isVisible({ timeout: TIMEOUTS.DIALOG }).catch(() => false))) {
    await page.reload({ waitUntil: 'networkidle' });
    await batches.openBatch(flow.batchName);
  }

  await expect(row, `${trainee.fullName} in batch "${flow.batchName}"`)
    .toBeVisible({ timeout: TIMEOUTS.NAV });
  await expect(batches.activeTab).toHaveText(`Active (${before + 1})`);

  // Read the minted login email off the row rather than deriving it.
  const rowText = await row.innerText();
  const mintedEmail = MOOL_TRAINEE_EMAIL_DOMAIN
    ? new RegExp(`[\\w.+-]+@${escapeRegExp(MOOL_TRAINEE_EMAIL_DOMAIN)}`)
    : /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  trainee.email = (rowText.match(mintedEmail) || [])[0] || null;
  expect(trainee.email, `minted login email in ${trainee.fullName}'s row`).toBeTruthy();

  await batches.startBatch();
  await expect(card).toContainText('Ongoing', { timeout: TIMEOUTS.LIST });

  flow.batchCode = flow.batchCode || (await batches.readBatchCode(card));
  flow.trainee = trainee;
  saveMoolRun();

  console.log(
    `Mool: added ${trainee.fullName} (${trainee.email}) to batch "${flow.batchName}" ` +
    `and started it — batch code ${flow.batchCode || 'NOT FOUND'}`
  );

  return trainee;
}

/**
 * Phase 3, first half — mirrors traineeJoinsBatch, but signs in to the Mool Health
 * workspace. The second half (Day 1) is tenant-agnostic, so the spec reuses
 * traineeWorksThroughDayOne from trainee.flow.js.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function moolTraineeJoinsBatch(page, flow) {
  expect(flow.trainee?.email, 'trainee email from the add-trainee phase').toBeTruthy();
  expect(flow.batchCode, 'batch code from the batch card').toBeTruthy();

  const login = new MoolLoginPage(page);
  const training = new MoolTrainingPage(page);

  await login.loginAsTrainee(flow.trainee, {
    onPasswordSet: (password) => {
      saveMoolRun();
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
  console.log(`Mool: ${flow.trainee.email} joined "${flow.batchName}" and started training`);

  return training;
}

/** @param {import('@playwright/test').Page} page */
async function openStarfleetUserList(page) {
  const starfleet = new StarfleetPage(page);

  await starfleet.login(MOOL_USER);
  await starfleet.openUserList();
  console.log(`Starfleet: ${MOOL_USER.email} opened User List`);
}

module.exports = {
  moolBulkOnboardTrainees,
  moolAddTraineeAndStartBatch,
  moolTraineeJoinsBatch,
  openStarfleetUserList,
};
