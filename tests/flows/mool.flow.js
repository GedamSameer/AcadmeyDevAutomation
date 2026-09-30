// tests/flows/mool.flow.js
//
// The Mool Health run:
//   Phase 1 — bulk-onboard N outsource trainees in the Mool Health workspace
//   Phase 2 — sign in to Starfleet and open User -> User List

const { expect } = require('@playwright/test');

const { TRAINEE_COUNT } = require('../support/config');
const { MOOL_USER, MOOL_MODULE_OPTION, MOOL_MANAGER_EMAIL, MOOL_PATHS } =
  require('../support/mool.config');
const { saveMoolRun, moolBatchNameFor } = require('../support/mool.state');
const { writeBulkCsv } = require('../support/data');
const { MoolLoginPage, MoolOnboardingPage, MoolBatchManagementPage } =
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

/** @param {import('@playwright/test').Page} page */
async function openStarfleetUserList(page) {
  const starfleet = new StarfleetPage(page);

  await starfleet.login(MOOL_USER);
  await starfleet.openUserList();
  console.log(`Starfleet: ${MOOL_USER.email} opened User List`);
}

module.exports = { moolBulkOnboardTrainees, openStarfleetUserList };
