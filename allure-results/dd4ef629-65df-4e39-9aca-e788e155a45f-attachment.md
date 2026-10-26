# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: buddy-up.spec.js >> Traya Academy — Buddy Up >> QA and Trainee complete a Buddy Up call
- Location: tests/buddy-up.spec.js:68:8

# Error details

```
Error: batch name from the onboarding phase

expect(received).toBeTruthy()

Received: null
```

# Test source

```ts
  1   | // tests/flows/buddyup.call.flow.js
  2   | //
  3   | // Phase 5 of the Buddy Up run — the QA and a trainee from the batch on one call, each in
  4   | // their own browser context (both have to be live at once, so this phase can't use the
  5   | // one-page withFreshContext shape the others do).
  6   | //
  7   | //   QA starts the call      -> trainee joins from their home page
  8   | //   both see each other's correct name, and the QA's form carries the trainee's details
  9   | //   both cycle Split / Meeting-only / Form-or-CRM-only without the call reconnecting
  10  | //   QA fills the form at random and submits
  11  | //   trainee sees the Buddy Up completed; QA sees the evaluation result on their dashboard
  12  | 
  13  | const { expect } = require('@playwright/test');
  14  | 
  15  | const { BUDDY_USERS } = require('../support/buddyup.config');
  16  | const { saveBuddyRun } = require('../support/buddyup.state');
  17  | const { flagUnless } = require('../support/issues');
  18  | const { LoginPage } = require('../pages/LoginPage');
  19  | const { BuddyUpTrainingPage, QaLoginPage, QaDashboardPage, QaCallPage, TraineeCallPage, percentIn } =
  20  |   require('../pages/BuddyUpPages');
  21  | const { rememberPassword } = require('./buddyup.flow');
  22  | 
  23  | // Both sides need a camera and microphone; the spec launches Chromium with fake devices.
  24  | const MEDIA = { permissions: ['camera', 'microphone'], viewport: { width: 1440, height: 900 } };
  25  | 
  26  | /**
  27  |  * Which trainee to call: the QA is only offered the trainees assigned to them, so pick from
  28  |  * this batch's cards — the trainee who did the training if they are among them.
  29  |  */
  30  | async function pickAssignedTrainee(dashboard, flow) {
  31  |   await dashboard.filter(flow.batchName);
  32  |   // isVisible() answers about this instant, so let the filtered cards render first.
  33  |   await expect(dashboard.page.getByText(flow.batchName, { exact: true }).first(), `${flow.batchName} cards on the QA dashboard`)
  34  |     .toBeVisible({ timeout: 30000 });
  35  |   const preferred = flow.trainee ? [flow.trainee, ...flow.roster] : flow.roster;
  36  |   for (const candidate of preferred) {
  37  |     if (await dashboard.startButton(candidate.fullName).isVisible().catch(() => false)) {
  38  |       return flow.roster.find((t) => t.email === candidate.email) || candidate;
  39  |     }
  40  |   }
  41  |   throw new Error(
  42  |     `No trainee from "${flow.batchName}" has a Start Evaluation Call on the QA dashboard — ` +
  43  |     `none of them is assigned to ${BUDDY_USERS.qa.email}.`
  44  |   );
  45  | }
  46  | 
  47  | /** @param {import('@playwright/test').Browser} browser */
  48  | async function qaBuddyUpCall(browser, flow) {
> 49  |   expect(flow.batchName, 'batch name from the onboarding phase').toBeTruthy();
      |                                                                  ^ Error: batch name from the onboarding phase
  50  |   expect(flow.roster?.length, 'batch roster from the trainer phase').toBeTruthy();
  51  | 
  52  |   const qaContext = await browser.newContext(MEDIA);
  53  |   const traineeContext = await browser.newContext(MEDIA);
  54  |   try {
  55  |     const qaPage = await qaContext.newPage();
  56  |     const traineePage = await traineeContext.newPage();
  57  |     const dashboard = new QaDashboardPage(qaPage);
  58  |     const qaCall = new QaCallPage(qaPage);            // starts watching the connection now
  59  |     const traineeCall = new TraineeCallPage(traineePage);
  60  | 
  61  |     // ── QA opens the call ───────────────────────────────────────────────────
  62  |     await new QaLoginPage(qaPage).login(BUDDY_USERS.qa);
  63  |     await dashboard.waitForOpen();
  64  |     const qaName = (await dashboard.evaluatorName.innerText()).trim();
  65  | 
  66  |     const trainee = await pickAssignedTrainee(dashboard, flow);
  67  |     const card = dashboard.card(trainee.fullName);
  68  |     await expect(card, 'QA card carries the trainee email').toContainText(trainee.email);
  69  |     await expect(card, 'QA card carries the batch').toContainText(flow.batchName);
  70  |     await expect(card, 'QA card names this QA as evaluator').toContainText(qaName);
  71  | 
  72  |     await dashboard.startCall(trainee.fullName);
  73  |     await qaCall.waitForOpen(trainee.fullName);
  74  | 
  75  |     // The QA sees the right person: header, form, and the form's prefilled details.
  76  |     await expect(qaCall.header.locator('..')).toContainText(`${trainee.fullName}`);
  77  |     await expect(qaCall.header.locator('..')).toContainText(flow.batchName);
  78  |     await expect(qaCall.evaluatorLine).toHaveText(`Evaluator: ${qaName} · Trainee: ${trainee.fullName}`);
  79  |     await expect(qaCall.field('Trainee / Coach Name')).toHaveValue(trainee.fullName);
  80  |     await expect(qaCall.field('Coach Email ID')).toHaveValue(trainee.email);
  81  |     await expect(qaCall.field('Batch Name & Num')).toHaveValue(flow.batchName);
  82  |     await expect(qaCall.field('Audited By')).toHaveValue(qaName);
  83  |     if (trainee.email === flow.trainee?.email && flow.trainee.employeeId) {
  84  |       await expect(qaCall.field('Employee ID')).toHaveValue(flow.trainee.employeeId);
  85  |     }
  86  | 
  87  |     // ── Trainee joins ───────────────────────────────────────────────────────
  88  |     await new LoginPage(traineePage).loginAsTrainee(trainee, { onPasswordSet: rememberPassword(flow, trainee) });
  89  |     saveBuddyRun();
  90  |     await expect(traineeCall.callCardHeading).toBeVisible({ timeout: 30000 });
  91  |     // The pre-call card has been seen to print "QA Evaluator (QA Evaluator)" here rather
  92  |     // than the QA's name. Reported, but it doesn't stop the call being tested — the name
  93  |     // inside the call and on the completed card are hard checks below.
  94  |     const cardName = await traineeCall.cardQaName();
  95  |     await flagUnless(
  96  |       async () => expect(cardName).toBe(qaName),
  97  |       `Trainee's Buddy Up card before joining names the QA as "${cardName}" instead of "${qaName}"`
  98  |     );
  99  |     const joinedLive = await traineeCall.join();
  100 |     await flagUnless(
  101 |       async () => expect(joinedLive).toBe(true),
  102 |       'Trainee\'s Buddy Up card never switched to "Join Live Call Now" after the QA started the call'
  103 |     );
  104 |     // The session lives under /learn, which raises the daily check-in on a trainee's first
  105 |     // visit of the day — on top of the live call, where it blocks every control.
  106 |     const checkInOverCall = await new BuddyUpTrainingPage(traineePage).checkIn('Buddy Up call');
  107 |     await flagUnless(
  108 |       async () => expect(checkInOverCall).toBe(false),
  109 |       'Daily check-in popup opened on top of the live Buddy Up call and blocked the trainee\'s controls'
  110 |     );
  111 | 
  112 |     await qaCall.waitForPeer(trainee.fullName);
  113 |     await traineeCall.waitForPeer(qaName);
  114 |     const qaJoined = qaCall.connection.snapshot();
  115 |     const traineeJoined = traineeCall.connection.snapshot();
  116 |     expect(qaJoined.opened, 'QA joined over one realtime connection').toBe(1);
  117 |     expect(traineeJoined.opened, 'trainee joined over one realtime connection').toBe(1);
  118 | 
  119 |     // ── Both switch views — the call must stay up throughout ─────────────────
  120 |     const steps = [
  121 |       ['qa', 'meeting'], ['trainee', 'meeting'],
  122 |       ['qa', 'form'], ['trainee', 'crm'],
  123 |       ['qa', 'split'], ['trainee', 'split'],
  124 |     ];
  125 |     for (const [who, mode] of steps) {
  126 |       await (who === 'qa' ? qaCall : traineeCall).switchView(mode);
  127 |       await expect(qaCall.videos, `QA still has both videos after ${who} -> ${mode}`).toHaveCount(2);
  128 |       await expect(traineeCall.videos, `trainee still has both videos after ${who} -> ${mode}`).toHaveCount(2);
  129 |     }
  130 |     await expect(qaCall.peerLabel(trainee.fullName)).toBeVisible();
  131 |     await expect(traineeCall.qaNameInCall(qaName)).toBeVisible();
  132 |     expect(qaCall.connection.snapshot(), 'QA call never reconnected while switching views').toEqual(qaJoined);
  133 |     expect(traineeCall.connection.snapshot(), 'trainee call never reconnected while switching views')
  134 |       .toEqual(traineeJoined);
  135 | 
  136 |     // ── QA gives feedback ───────────────────────────────────────────────────
  137 |     const answered = await qaCall.fillRandomly();
  138 |     const { summary, percent } = await qaCall.submitReview();
  139 |     expect(summary, 'submission summary names the trainee').toContain(trainee.fullName);
  140 |     expect(summary, 'submission summary names the batch').toContain(flow.batchName);
  141 |     expect(summary, 'submission summary names the QA as auditor').toContain(qaName);
  142 |     expect(percent, 'submission summary shows a score').toBeGreaterThanOrEqual(0);
  143 |     console.log(`QA answered ${answered} questions at random — ${percent}%`);
  144 | 
  145 |     // ── Trainee sees the Buddy Up completed ─────────────────────────────────
  146 |     const traineePercent = await traineeCall.waitForCompleted();
  147 |     expect(await traineeCall.cardQaName(), 'QA name on the trainee\'s completed card').toBe(qaName);
  148 |     expect(traineePercent, 'trainee sees the same score').toBe(percent);
  149 | 
```