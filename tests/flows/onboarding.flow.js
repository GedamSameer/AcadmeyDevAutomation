// tests/flows/onboarding.flow.js
//
// Phase 1 — the onboarding specialist bulk-onboards N outsource trainees, which creates
// the batch the other two phases work against.

const { expect } = require('@playwright/test');

const { USERS, TRAINEE_COUNT, PATHS } = require('../support/config');
const { batchNameFor } = require('../support/naming');
const { writeBulkCsv } = require('../support/data');
const { saveRun } = require('../support/state');
const { LoginPage } = require('../pages/LoginPage');
const { OnboardingPage } = require('../pages/OnboardingPage');
const { BatchManagementPage } = require('../pages/BatchManagementPage');

/**
 * Publishes batchNo / batchName / batchCode onto `flow` for the phases that follow.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function bulkOnboardTrainees(page, flow, { count = TRAINEE_COUNT } = {}) {
  const login = new LoginPage(page);
  const onboarding = new OnboardingPage(page);
  const batches = new BatchManagementPage(page);

  writeBulkCsv(PATHS.CSV, count);
  await login.login(USERS.onboardingSpecialist);

  // Claim a batch number nobody is using before building the batch around it.
  await batches.goto();
  const batchNo = await batches.pickFreeBatchNo();
  const batchName = batchNameFor(batchNo);

  // Onboarding → Out Source
  await onboarding.goto();
  await onboarding.selectHouse('Out Source');

  await onboarding.downloadSampleSheet();
  await onboarding.uploadSheet(PATHS.CSV);

  await onboarding.fillManagerEmails();
  await onboarding.selectCohort();
  await onboarding.reviewSchedule();
  await onboarding.selectPartnerAndLocation();
  await onboarding.pickDates();
  await onboarding.setBatchNo(batchNo);
  await onboarding.createBatch(count);

  // The batch showing up in Batch Management is the real "it landed" signal, and its
  // card carries the join code the trainee phase needs.
  await batches.goto();
  const card = await batches.openBatch(batchName);
  await expect(card).toContainText('Not Started');

  flow.batchNo = batchNo;
  flow.batchName = batchName;
  flow.batchCode = await batches.readBatchCode(card);
  saveRun();

  expect(flow.batchCode, 'join code printed on the batch card').toBeTruthy();
  console.log(
    `Bulk-onboarded ${count} trainees into batch "${batchName}" (code ${flow.batchCode})`
  );

  return flow;
}

module.exports = { bulkOnboardTrainees };