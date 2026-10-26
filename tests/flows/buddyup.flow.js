// tests/flows/buddyup.flow.js
//
// The Buddy Up run (tests/buddy-up.spec.js), phase by phase:
//   1. Onboarding specialist bulk-onboards an Offline batch that includes Staff Support rows
//   2. Trainer adds a trainee by hand and more by CSV, turns a Staff Support into a Trainee,
//      and starts the batch
//   3. A trainee logs in and trains up to the Spoken English assessment
//   4. Academy admin: CMS module download -> new module, CMS v2 Directories, Config & Bank
//   5. QA and a trainee run the Buddy Up call (qaBuddyUpCall, below)

const fs = require('fs');
const { expect } = require('@playwright/test');

const { USERS, TRAINEE_COUNT, TRAINEE_EMAIL_DOMAIN, TIMEOUTS } = require('../support/config');
const {
  BUDDY_USERS,
  STAFF_SUPPORT_COUNT,
  CSV_ADD_COUNT,
  CMS_SOURCE_MODULE,
  BUDDY_PATHS,
  BUDDY_TIMEOUTS,
} = require('../support/buddyup.config');
const { saveBuddyRun } = require('../support/buddyup.state');
const { saveCredentials } = require('../support/state');
const { flagUnless } = require('../support/issues');
const { batchNameFor, escapeRegExp } = require('../support/naming');
const { makeCsvTrainee, makeFormTrainee, writeCsvRows } = require('../support/data');
const { LoginPage } = require('../pages/LoginPage');
const { OnboardingPage } = require('../pages/OnboardingPage');
const { BatchManagementPage } = require('../pages/BatchManagementPage');
const { TraineeProfilePage } = require('../pages/TraineeProfilePage');
const { CmsPage } = require('../pages/CmsPage');
const { CmsV2Page } = require('../pages/CmsV2Page');
const { BuddyUpTrainingPage } = require('../pages/BuddyUpPages');

const mintedEmail = new RegExp(`[\\w.+-]+@${escapeRegExp(TRAINEE_EMAIL_DOMAIN)}`);

/** Read the login email the platform minted for `fullName` off their batch-table row. */
async function readMintedEmail(batches, fullName) {
  const email = ((await batches.traineeRow(fullName).innerText()).match(mintedEmail) || [])[0];
  expect(email, `minted login email in ${fullName}'s row`).toBeTruthy();
  return email;
}

/**
 * Phase 1 — bulk-onboard an Out Source batch for the Offline module with
 * STAFF_SUPPORT_COUNT of the rows as Staff Support, then check after a refresh that everyone
 * landed and the Staff Support rows say so.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function onboardBatchWithStaffSupport(page, flow, { count = TRAINEE_COUNT } = {}) {
  expect(STAFF_SUPPORT_COUNT, 'at least one trainee must stay a Trainee').toBeLessThan(count);

  const login = new LoginPage(page);
  const onboarding = new OnboardingPage(page);
  const batches = new BatchManagementPage(page);

  const rows = Array.from({ length: count }, (_, i) =>
    makeCsvTrainee(i < STAFF_SUPPORT_COUNT ? 'Staff Support' : 'Trainee'));
  writeCsvRows(BUDDY_PATHS.BULK_CSV, rows);

  await login.login(USERS.onboardingSpecialist);

  await batches.goto();
  const batchNo = await batches.pickFreeBatchNo();
  const batchName = batchNameFor(batchNo);

  // Onboarding → Out Source, cohort Offline (MODULE_OPTION)
  await onboarding.goto();
  await onboarding.selectHouse('Out Source');
  await onboarding.downloadSampleSheet();
  await onboarding.uploadSheet(BUDDY_PATHS.BULK_CSV);
  await onboarding.fillManagerEmails();
  await onboarding.selectCohort();
  await onboarding.reviewSchedule();
  await onboarding.selectPartnerAndLocation();
  await onboarding.pickDates();
  await onboarding.setBatchNo(batchNo);
  await onboarding.createBatch(count);

  await batches.goto();
  const card = await batches.openBatch(batchName);
  await expect(card).toContainText('Not Started');

  // After a refresh, so the table comes from the server rather than the wizard's cache.
  await batches.reloadBatch(batchName);
  await expect(batches.activeTab, 'everyone in the sheet is in the batch').toHaveText(`Active (${count})`);
  for (const row of rows) {
    await expect(batches.traineeRow(row.name), `${row.name} onboarded`).toBeVisible();
    if (row.role === 'Staff Support') {
      await expect(batches.staffSupportTag(row.name), `${row.name} shows as Staff Support`).toBeVisible();
    } else {
      await expect(batches.staffSupportTag(row.name), `${row.name} shows as a Trainee`).toHaveCount(0);
    }
  }

  flow.batchNo = batchNo;
  flow.batchName = batchName;
  flow.batchCode = await batches.readBatchCode(card);
  flow.bulkTrainees = rows.map(({ name, role }) => ({ name, role }));
  flow.staffSupport = flow.bulkTrainees.find((t) => t.role === 'Staff Support');
  saveBuddyRun();

  console.log(
    `Onboarded ${count} people (${STAFF_SUPPORT_COUNT} Staff Support) into "${batchName}" ` +
    `(code ${flow.batchCode})`
  );
  return flow;
}

/**
 * Phase 2 — the trainer adds one trainee through the New trainee tab and CSV_ADD_COUNT
 * more through Upload CSV, checking each after a refresh; changes a Staff Support to a
 * Trainee from their profile; then starts the batch.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function trainerAddsTraineesAndStartsBatch(page, flow) {
  expect(flow.batchName, 'batch name from the onboarding phase').toBeTruthy();
  expect(flow.staffSupport, 'a Staff Support row from the onboarding phase').toBeTruthy();

  const login = new LoginPage(page);
  const batches = new BatchManagementPage(page);
  const profile = new TraineeProfilePage(page);

  await login.login(USERS.trainer);
  await batches.goto();
  await batches.openBatch(flow.batchName);
  let expected = await batches.activeCount();

  // ── New trainee ────────────────────────────────────────────────────────────
  const trainee = makeFormTrainee();
  const dialog = await batches.openAddTraineeDialog(flow.batchName);
  await dialog.selectNewTrainee();
  await dialog.fill(trainee);
  await dialog.submit();
  expected += 1;

  await batches.reloadBatch(flow.batchName);
  await expect(batches.traineeRow(trainee.fullName), `${trainee.fullName} onboarded`)
    .toBeVisible({ timeout: TIMEOUTS.NAV });
  await expect(batches.activeTab).toHaveText(`Active (${expected})`);
  trainee.email = await readMintedEmail(batches, trainee.fullName);
  flow.formTrainee = trainee;
  saveBuddyRun();

  // ── Upload CSV ─────────────────────────────────────────────────────────────
  const csvRows = Array.from({ length: CSV_ADD_COUNT }, () => makeCsvTrainee());
  writeCsvRows(BUDDY_PATHS.ADD_CSV, csvRows);
  const csvDialog = await batches.openAddTraineeDialog(flow.batchName);
  await csvDialog.uploadCsv(BUDDY_PATHS.ADD_CSV, csvRows.map((r) => r.name));
  expected += CSV_ADD_COUNT;

  // The CSV is onboarded in the background, so give the rows a few refreshes to arrive.
  await expect
    .poll(async () => {
      await batches.reloadBatch(flow.batchName);
      return batches.activeCount();
    }, { timeout: BUDDY_TIMEOUTS.CSV_ONBOARD, intervals: [5000], message: 'CSV trainees reach the batch' })
    .toBe(expected);
  for (const row of csvRows) {
    await expect(batches.traineeRow(row.name), `${row.name} onboarded from CSV`).toBeVisible();
    await expect(batches.staffSupportTag(row.name)).toHaveCount(0);
  }
  flow.csvTrainees = csvRows.map(({ name }) => ({ name }));
  saveBuddyRun();

  // ── Staff Support -> Trainee ───────────────────────────────────────────────
  const staff = flow.staffSupport.name;
  await expect(batches.staffSupportTag(staff), `${staff} is Staff Support before the change`).toBeVisible();
  await batches.openTraineeProfile(staff);
  await profile.waitForOpen(staff);
  await expect(profile.role).toHaveText('Staff Support');
  await profile.setRole('Trainee');

  await batches.goto();
  await batches.openBatch(flow.batchName);
  await batches.reloadBatch(flow.batchName);
  await expect(batches.traineeRow(staff)).toBeVisible();
  await expect(
    batches.staffSupportTag(staff),
    `${staff} no longer shows as Staff Support in Batch Management`
  ).toHaveCount(0);

  // Every login in the batch, so the Buddy Up phase can sign in whichever trainee the QA
  // has been assigned.
  const everyone = [...flow.bulkTrainees.map((t) => t.name), trainee.fullName, ...csvRows.map((r) => r.name)];
  flow.roster = [];
  for (const name of everyone) flow.roster.push({ fullName: name, email: await readMintedEmail(batches, name) });

  // ── Start ──────────────────────────────────────────────────────────────────
  await batches.startBatch();
  const card = batches.card(flow.batchName).first();
  await expect(card).toContainText('Ongoing', { timeout: TIMEOUTS.LIST });

  flow.batchCode = flow.batchCode || (await batches.readBatchCode(card));
  flow.trainee = trainee;
  saveBuddyRun();

  console.log(
    `Trainer added ${trainee.fullName} by form and ${CSV_ADD_COUNT} by CSV, made ${staff} a ` +
    `Trainee, and started "${flow.batchName}"`
  );
}

/** Persist a trainee's working password the moment the platform accepts one. */
const rememberPassword = (flow, trainee) => (password) => {
  saveBuddyRun();
  saveCredentials({
    batchName: flow.batchName,
    batchCode: flow.batchCode,
    username: trainee.fullName,
    email: trainee.email,
    password,
  });
};

/**
 * Phase 3 — the form-added trainee logs in (first login: temp password -> new password;
 * the flaky login API is retried inside LoginPage) and works through Day 1 until the
 * Spoken English assessment is open, stopping before it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function traineeTrainsUntilSpokenEnglish(page, flow) {
  expect(flow.trainee?.email, 'trainee email from the trainer phase').toBeTruthy();

  const login = new LoginPage(page);
  const training = new BuddyUpTrainingPage(page);

  await login.loginAsTrainee(flow.trainee, { onPasswordSet: rememberPassword(flow, flow.trainee) });
  await training.joinBatch(flow.batchCode);

  const startTest = await training.workThroughTraining();
  expect(startTest, 'Day 1 reaches a test').not.toBeNull();
  await expect(training.spokenEnglish, 'the test reached is Spoken English').toBeVisible();
  await expect(startTest).toBeEnabled();

  const entry = flow.roster?.find((t) => t.email === flow.trainee.email);
  if (entry) entry.password = flow.trainee.password;
  saveBuddyRun();
  console.log(`${flow.trainee.email} trained up to the Spoken English assessment`);
}

/**
 * Phase 4 — the academy admin's CMS checks: download a module, upload it under a new name
 * as a new module; open CMS v2 Directories; walk every Config & Bank tab.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} flow
 */
async function adminChecksCms(page, flow) {
  const login = new LoginPage(page);
  const cms = new CmsPage(page);
  const cmsV2 = new CmsV2Page(page);

  await login.login(BUDDY_USERS.academyAdmin);

  // ── CMS (v1): download -> new module ───────────────────────────────────────
  await cms.goto();
  const sourceSummary = await cms.openModuleSheet(CMS_SOURCE_MODULE);
  fs.mkdirSync(BUDDY_PATHS.DOWNLOADS, { recursive: true });
  const file = await cms.downloadModule(BUDDY_PATHS.DOWNLOADS);

  const trackName = `QA Buddy ${CMS_SOURCE_MODULE} Copy ${Date.now().toString(36)}`;
  const uploadedSummary = await cms.createModuleFromFile(file, trackName);
  // Same shape as the module it came from — "1 days · 5 resources · 1 test (5 questions)".
  expect(uploadedSummary, 'the downloaded module re-uploads with the same content')
    .toContain(sourceSummary.replace(/\s*·\s*all checks passed$/, ''));
  flow.cmsModule = trackName;
  saveBuddyRun();
  console.log(`CMS: "${CMS_SOURCE_MODULE}" downloaded and published as "${trackName}"`);

  // ── CMS v2: Directories ────────────────────────────────────────────────────
  await cmsV2.goto();
  await cmsV2.openDirectories();
  // Reached by in-app navigation straight after publishing, the library has been seen to
  // still hold the pre-publish list until the page is reloaded.
  await flagUnless(
    () => expect(cmsV2.libraryItem(trackName)).toBeVisible(),
    `CMS v2 Directories didn't list the new module "${trackName}" until the page was reloaded`
  );
  await cmsV2.reload();
  await expect(cmsV2.libraryItem(trackName), 'the new module shows up in CMS v2 too').toBeVisible();
  const children = await cmsV2.openFolder(CMS_SOURCE_MODULE);
  expect(children.length, `${CMS_SOURCE_MODULE} folder has items`).toBeGreaterThan(0);
  await cmsV2.cycleViews();
  const filtered = await cmsV2.filterFolder(CMS_SOURCE_MODULE);
  expect(filtered.length, 'filter keeps the matching items').toBeGreaterThan(0);
  expect(filtered.length, 'filter drops the others').toBeLessThanOrEqual(children.length);
  expect(filtered.every((t) => t.toLowerCase().includes(CMS_SOURCE_MODULE.toLowerCase()))).toBe(true);

  // ── CMS v2: Config & Bank ──────────────────────────────────────────────────
  await cmsV2.openConfigBank();
  await cmsV2.checkComponentConfig();
  const questions = await cmsV2.checkQuestionBank();
  expect(questions, 'Question Bank has questions').toBeGreaterThan(0);
  const forms = await cmsV2.checkFormWarehouse();
  expect(forms, 'Form Warehouse has forms').toBeGreaterThan(0);
  const resources = await cmsV2.checkResourcesBank();
  expect(resources.total, 'Resources Bank has resources').toBeGreaterThan(0);

  console.log(
    `CMS v2: Directories OK (${children.length} items in ${CMS_SOURCE_MODULE}); Config & Bank OK — ` +
    `${questions} questions, ${forms} forms, ${resources.total} resources`
  );
}

module.exports = {
  onboardBatchWithStaffSupport,
  trainerAddsTraineesAndStartsBatch,
  traineeTrainsUntilSpokenEnglish,
  adminChecksCms,
  rememberPassword,
};
