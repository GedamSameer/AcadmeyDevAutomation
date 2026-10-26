// tests/flows/buddyup.call.flow.js
//
// Phase 5 of the Buddy Up run — the QA and a trainee from the batch on one call, each in
// their own browser context (both have to be live at once, so this phase can't use the
// one-page withFreshContext shape the others do).
//
//   QA starts the call      -> trainee joins from their home page
//   both see each other's correct name, and the QA's form carries the trainee's details
//   both cycle Split / Meeting-only / Form-or-CRM-only without the call reconnecting
//   QA fills the form at random and submits
//   trainee sees the Buddy Up completed; QA sees the evaluation result on their dashboard

const { expect } = require('@playwright/test');

const { BUDDY_USERS } = require('../support/buddyup.config');
const { saveBuddyRun } = require('../support/buddyup.state');
const { flagUnless } = require('../support/issues');
const { LoginPage } = require('../pages/LoginPage');
const { BuddyUpTrainingPage, QaLoginPage, QaDashboardPage, QaCallPage, TraineeCallPage, percentIn } =
  require('../pages/BuddyUpPages');
const { rememberPassword } = require('./buddyup.flow');

// Both sides need a camera and microphone; the spec launches Chromium with fake devices.
const MEDIA = { permissions: ['camera', 'microphone'], viewport: { width: 1440, height: 900 } };

/**
 * Which trainee to call: the QA is only offered the trainees assigned to them, so pick from
 * this batch's cards — the trainee who did the training if they are among them.
 */
async function pickAssignedTrainee(dashboard, flow) {
  await dashboard.filter(flow.batchName);
  // isVisible() answers about this instant, so let the filtered cards render first.
  await expect(dashboard.page.getByText(flow.batchName, { exact: true }).first(), `${flow.batchName} cards on the QA dashboard`)
    .toBeVisible({ timeout: 30000 });
  const preferred = flow.trainee ? [flow.trainee, ...flow.roster] : flow.roster;
  for (const candidate of preferred) {
    if (await dashboard.startButton(candidate.fullName).isVisible().catch(() => false)) {
      return flow.roster.find((t) => t.email === candidate.email) || candidate;
    }
  }
  throw new Error(
    `No trainee from "${flow.batchName}" has a Start Evaluation Call on the QA dashboard — ` +
    `none of them is assigned to ${BUDDY_USERS.qa.email}.`
  );
}

/** @param {import('@playwright/test').Browser} browser */
async function qaBuddyUpCall(browser, flow) {
  expect(flow.batchName, 'batch name from the onboarding phase').toBeTruthy();
  expect(flow.roster?.length, 'batch roster from the trainer phase').toBeTruthy();

  const qaContext = await browser.newContext(MEDIA);
  const traineeContext = await browser.newContext(MEDIA);
  try {
    const qaPage = await qaContext.newPage();
    const traineePage = await traineeContext.newPage();
    const dashboard = new QaDashboardPage(qaPage);
    const qaCall = new QaCallPage(qaPage);            // starts watching the connection now
    const traineeCall = new TraineeCallPage(traineePage);

    // ── QA opens the call ───────────────────────────────────────────────────
    await new QaLoginPage(qaPage).login(BUDDY_USERS.qa);
    await dashboard.waitForOpen();
    const qaName = (await dashboard.evaluatorName.innerText()).trim();

    const trainee = await pickAssignedTrainee(dashboard, flow);
    const card = dashboard.card(trainee.fullName);
    await expect(card, 'QA card carries the trainee email').toContainText(trainee.email);
    await expect(card, 'QA card carries the batch').toContainText(flow.batchName);
    await expect(card, 'QA card names this QA as evaluator').toContainText(qaName);

    await dashboard.startCall(trainee.fullName);
    await qaCall.waitForOpen(trainee.fullName);

    // The QA sees the right person: header, form, and the form's prefilled details.
    await expect(qaCall.header.locator('..')).toContainText(`${trainee.fullName}`);
    await expect(qaCall.header.locator('..')).toContainText(flow.batchName);
    await expect(qaCall.evaluatorLine).toHaveText(`Evaluator: ${qaName} · Trainee: ${trainee.fullName}`);
    await expect(qaCall.field('Trainee / Coach Name')).toHaveValue(trainee.fullName);
    await expect(qaCall.field('Coach Email ID')).toHaveValue(trainee.email);
    await expect(qaCall.field('Batch Name & Num')).toHaveValue(flow.batchName);
    await expect(qaCall.field('Audited By')).toHaveValue(qaName);
    if (trainee.email === flow.trainee?.email && flow.trainee.employeeId) {
      await expect(qaCall.field('Employee ID')).toHaveValue(flow.trainee.employeeId);
    }

    // ── Trainee joins ───────────────────────────────────────────────────────
    await new LoginPage(traineePage).loginAsTrainee(trainee, { onPasswordSet: rememberPassword(flow, trainee) });
    saveBuddyRun();
    await expect(traineeCall.callCardHeading).toBeVisible({ timeout: 30000 });
    // The pre-call card has been seen to print "QA Evaluator (QA Evaluator)" here rather
    // than the QA's name. Reported, but it doesn't stop the call being tested — the name
    // inside the call and on the completed card are hard checks below.
    const cardName = await traineeCall.cardQaName();
    await flagUnless(
      async () => expect(cardName).toBe(qaName),
      `Trainee's Buddy Up card before joining names the QA as "${cardName}" instead of "${qaName}"`
    );
    const joinedLive = await traineeCall.join();
    await flagUnless(
      async () => expect(joinedLive).toBe(true),
      'Trainee\'s Buddy Up card never switched to "Join Live Call Now" after the QA started the call'
    );
    // The session lives under /learn, which raises the daily check-in on a trainee's first
    // visit of the day — on top of the live call, where it blocks every control.
    const checkInOverCall = await new BuddyUpTrainingPage(traineePage).checkIn('Buddy Up call');
    await flagUnless(
      async () => expect(checkInOverCall).toBe(false),
      'Daily check-in popup opened on top of the live Buddy Up call and blocked the trainee\'s controls'
    );

    await qaCall.waitForPeer(trainee.fullName);
    await traineeCall.waitForPeer(qaName);
    const qaJoined = qaCall.connection.snapshot();
    const traineeJoined = traineeCall.connection.snapshot();
    expect(qaJoined.opened, 'QA joined over one realtime connection').toBe(1);
    expect(traineeJoined.opened, 'trainee joined over one realtime connection').toBe(1);

    // ── Both switch views — the call must stay up throughout ─────────────────
    const steps = [
      ['qa', 'meeting'], ['trainee', 'meeting'],
      ['qa', 'form'], ['trainee', 'crm'],
      ['qa', 'split'], ['trainee', 'split'],
    ];
    for (const [who, mode] of steps) {
      await (who === 'qa' ? qaCall : traineeCall).switchView(mode);
      await expect(qaCall.videos, `QA still has both videos after ${who} -> ${mode}`).toHaveCount(2);
      await expect(traineeCall.videos, `trainee still has both videos after ${who} -> ${mode}`).toHaveCount(2);
    }
    await expect(qaCall.peerLabel(trainee.fullName)).toBeVisible();
    await expect(traineeCall.qaNameInCall(qaName)).toBeVisible();
    expect(qaCall.connection.snapshot(), 'QA call never reconnected while switching views').toEqual(qaJoined);
    expect(traineeCall.connection.snapshot(), 'trainee call never reconnected while switching views')
      .toEqual(traineeJoined);

    // ── QA gives feedback ───────────────────────────────────────────────────
    const answered = await qaCall.fillRandomly();
    const { summary, percent } = await qaCall.submitReview();
    expect(summary, 'submission summary names the trainee').toContain(trainee.fullName);
    expect(summary, 'submission summary names the batch').toContain(flow.batchName);
    expect(summary, 'submission summary names the QA as auditor').toContain(qaName);
    expect(percent, 'submission summary shows a score').toBeGreaterThanOrEqual(0);
    console.log(`QA answered ${answered} questions at random — ${percent}%`);

    // ── Trainee sees the Buddy Up completed ─────────────────────────────────
    const traineePercent = await traineeCall.waitForCompleted();
    expect(await traineeCall.cardQaName(), 'QA name on the trainee\'s completed card').toBe(qaName);
    expect(traineePercent, 'trainee sees the same score').toBe(percent);

    // ── QA sees the evaluation result ───────────────────────────────────────
    await qaCall.leave();
    await dashboard.waitForOpen();
    await dashboard.filter(flow.batchName);
    // Coming back from the call, the card has been seen to still offer Start Evaluation
    // Call until the page is reloaded.
    await flagUnless(
      () => expect(dashboard.reviewLogged(trainee.fullName)).toBeVisible({ timeout: 10000 }),
      `QA dashboard still showed ${trainee.fullName} as not evaluated until the page was reloaded`
    );
    await dashboard.reload();
    await dashboard.filter(flow.batchName);
    const logged = dashboard.reviewLogged(trainee.fullName);
    await expect(logged, 'QA dashboard shows the evaluation as logged').toBeVisible();
    expect(percentIn(await logged.innerText()), 'dashboard score matches the submission').toBe(percent);

    await dashboard.openReview(trainee.fullName);
    await qaCall.waitForOpen(trainee.fullName);
    await expect(qaCall.update, 'the saved review reopens').toBeVisible({ timeout: 30000 });
    await expect(qaCall.scoreLine, 'reopened review shows the submitted score').toContainText(`(${percent}%)`);
    await expect(qaCall.field('Trainee / Coach Name')).toHaveValue(trainee.fullName);

    flow.buddyUp = { trainee: trainee.email, qa: qaName, percent };
    saveBuddyRun();
    console.log(`Buddy Up: ${qaName} evaluated ${trainee.fullName} — ${percent}%, completed on both sides`);
  } finally {
    await qaContext.close();
    await traineeContext.close();
  }
}

module.exports = { qaBuddyUpCall };
