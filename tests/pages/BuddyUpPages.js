// tests/pages/BuddyUpPages.js
//
// Everything the Buddy Up run needs beyond the Traya page objects:
//   BuddyUpTrainingPage  the trainee's Day 1, with Traya's daily check-in
//   QaLoginPage          QA sign-in — the QA lands on their own dashboard, not the workspace nav
//   QaDashboardPage      "Buddy Up QA Evaluation Calls": one card per assigned trainee
//   QaCallPage           the live evaluation: meeting on the left, form / CRM on the right
//   TraineeCallPage      the trainee's side: the home-page call card and the live session
//
// The call itself is Cloudflare Realtime: each participant holds exactly one websocket to
// socket-edge.realtime.cloudflare.com for as long as they are in the call, after fetching
// one token from /api/meetings/<id>/token. CallConnection watches both, which is how
// "switching views does not reconnect the call" is asserted.

const { expect } = require('@playwright/test');

const { TIMEOUTS } = require('../support/config');
const { BUDDY_TIMEOUTS } = require('../support/buddyup.config');
const { escapeRegExp } = require('../support/naming');
const { LoginPage } = require('./LoginPage');
const { TrainingPage } = require('./TrainingPage');

class BuddyUpTrainingPage extends TrainingPage {
  constructor(page) {
    super(page);
    this.spokenEnglish = page.getByRole('heading', { name: 'Spoken English Assessment', level: 1 });
  }

  /** Traya asks for a daily check-in remark once Continue Training is clicked. */
  async afterEnteringTraining() {
    await this.checkIn('Finish Day 1 modules');
  }
}

class QaLoginPage extends LoginPage {
  constructor(page) {
    super(page);
    this.dashboardHeading = page.getByRole('heading', { name: 'Buddy Up QA Evaluation Calls' });
  }

  /** Same credentials + OTP + workspace as staff, but the QA has no sidebar to wait for. */
  async login(user) {
    await this.submitCredentials(user);
    await this.skipPromptIfShown();
    await this.enterWorkspace.click();
    await expect(this.notYourSpace.or(this.dashboardHeading).first()).toBeVisible({ timeout: TIMEOUTS.NAV });
    await expect(this.notYourSpace, `${user.email} was refused the workspace`).toBeHidden();
  }
}

class QaDashboardPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Buddy Up QA Evaluation Calls' });
    // "Welcome back, <strong>Ravi Sharma</strong>. Here are the …"
    this.evaluatorName = page.getByRole('paragraph').filter({ hasText: 'Welcome back' }).locator('strong').first();
    this.search = page.getByRole('textbox', { name: 'Search assigned trainee or cohort…' });
  }

  /** One trainee's card — the innermost block holding both their name and an action. */
  card(fullName) {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByRole('heading', { name: fullName, exact: true, level: 4 }) })
      .filter({ has: this.page.getByRole('button') })
      .last();
  }

  startButton(fullName) {
    return this.card(fullName).getByRole('button', { name: 'Start Evaluation Call' });
  }

  /** "Completed · Review Logged (38%)" on a card once the review is submitted. */
  reviewLogged(fullName) {
    return this.card(fullName).getByText(/Completed · Review Logged \(\d+%\)/);
  }

  async waitForOpen() {
    await expect(this.heading).toBeVisible({ timeout: TIMEOUTS.NAV });
    await expect(this.evaluatorName).not.toBeEmpty();
  }

  async reload() {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForOpen();
  }

  async filter(text) {
    await this.search.fill(text);
    await this.page.waitForTimeout(800);
  }

  async startCall(fullName) {
    await this.startButton(fullName).click();
  }

  async openReview(fullName) {
    await this.card(fullName).getByRole('button', { name: 'View Evaluation Review' }).click();
  }
}

/**
 * Counts the realtime websockets a page opens and closes, and the meeting tokens it fetches.
 * Attach before joining — the socket is opened during the join.
 */
class CallConnection {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.opened = 0;
    this.closed = 0;
    this.tokens = 0;
    page.on('websocket', (ws) => {
      if (!/realtime\.cloudflare\.com/.test(ws.url())) return;
      this.opened++;
      ws.on('close', () => this.closed++);
    });
    page.on('request', (req) => {
      if (/\/api\/meetings\/[^/]+\/token/.test(req.url())) this.tokens++;
    });
  }

  snapshot() {
    return { opened: this.opened, closed: this.closed, tokens: this.tokens };
  }
}

/** Score percentage out of "Score: 35/92 (38%)", "29 / 77(38%)", "(38%)", "Score: 38%". */
const percentIn = (text) => Number((text.match(/(\d+)%/) || [])[1]);

class QaCallPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.connection = new CallConnection(page);

    this.header = page.getByText(/Live QA Evaluation/).first();
    this.backToDashboard = page.getByRole('button', { name: '← Back to QA Dashboard' });
    this.modes = {
      split: page.getByRole('button', { name: 'Split (50/50)' }),
      meeting: page.getByRole('button', { name: 'Meeting Only' }),
      form: page.getByRole('button', { name: 'Form & CRM Only' }),
    };
    this.connecting = page.getByText('Connecting to the call…').first();
    this.videos = page.locator('video');

    // Form pane
    this.evaluatorLine = page.getByText(/^Evaluator: .+ · Trainee: .+$/).first();
    this.score = page.getByText(/^Score:/).first();
    // "Score:" is its own span; the "35/92 (38%)" beside it lives in the parent.
    this.scoreLine = this.score.locator('..');
    this.submit = page.getByRole('button', { name: 'Submit Review' });
    this.update = page.getByRole('button', { name: 'Update Review' });
    this.confirmDialog = page.getByRole('dialog', { name: 'Confirm Evaluation Submission' });
    this.confirmSubmit = this.confirmDialog.getByRole('button', { name: 'Confirm & Submit Review' });
  }

  field(label) {
    return this.page.getByRole('textbox', { name: label, exact: true });
  }

  /** The trainee's label on the meeting pane: "Probe Alpha (Trainee)". */
  peerLabel(traineeName) {
    return this.page.getByText(`${traineeName} (Trainee)`, { exact: true }).first();
  }

  async waitForOpen(traineeName) {
    await expect(this.header).toBeVisible({ timeout: TIMEOUTS.NAV });
    await expect(this.page.getByText(traineeName, { exact: true }).first()).toBeVisible();
  }

  /** In the call with the trainee: no spinner, their tile is up, and two video streams. */
  async waitForPeer(traineeName) {
    await expect(this.connecting, 'QA connected to the call').toBeHidden({ timeout: BUDDY_TIMEOUTS.CALL_CONNECT });
    await expect(this.peerLabel(traineeName), `QA sees ${traineeName} in the call`)
      .toBeVisible({ timeout: BUDDY_TIMEOUTS.CALL_CONNECT });
    await expect(this.videos, 'QA has a local and a remote video').toHaveCount(2, {
      timeout: BUDDY_TIMEOUTS.CALL_CONNECT,
    });
  }

  /**
   * Switch view and check which panes are on screen. Both panes stay mounted (that is what
   * keeps the call alive); the hidden one collapses to nothing, so the check is whether
   * each pane is in the viewport.
   */
  async switchView(mode) {
    await this.modes[mode].click({ timeout: TIMEOUTS.DIALOG });
    await this.page.waitForTimeout(1000);
    const video = this.videos.first();
    const form = this.score;
    if (mode !== 'form') await expect(video, `QA ${mode}: meeting on screen`).toBeInViewport();
    else await expect(video, 'QA form: meeting off screen').not.toBeInViewport();
    if (mode !== 'meeting') await expect(form, `QA ${mode}: form on screen`).toBeInViewport();
    else await expect(form, 'QA meeting: form off screen').not.toBeInViewport();
  }

  /**
   * Answer every question at random: one option per Pass / Fail / NA-style group, a random
   * order category per order dropdown, text in every observation box, and a random subset
   * (at least one) of each checkbox list. The prefilled Basic Details are left alone.
   */
  async fillRandomly() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    const names = await this.page.getByRole('button').evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') || e.textContent || '').filter(Boolean));
    const groups = {};
    for (const name of names) {
      const m = name.match(/^(.+): ([^:]+)$/);
      if (!m || m[1] === 'Form') continue; // "Form: <name>" is the form picker
      (groups[m[1]] ||= []).push(name);
    }
    for (const options of Object.values(groups)) {
      await this.page.getByRole('button', { name: pick(options), exact: true }).click();
    }

    for (const select of await this.page.locator('select').all()) {
      const options = (await select.locator('option').allTextContents()).filter((o) => !/^Select/.test(o));
      if (options.length) await select.selectOption({ label: pick(options) });
    }

    for (const box of await this.page.locator('textarea').all()) {
      if (await box.isEditable()) await box.fill(`Auto feedback ${Math.random().toString(36).slice(2, 8)}`);
    }

    const checkboxes = await this.page.getByRole('checkbox').all();
    for (const [i, box] of checkboxes.entries()) {
      if (i === 0 || Math.random() < 0.5) await box.check();
    }

    return Object.keys(groups).length;
  }

  /**
   * Submit -> the confirmation summary -> confirm. Returns what the summary showed, so the
   * caller can check names and compare the score with what each side sees afterwards.
   */
  async submitReview() {
    await this.submit.click();
    await expect(this.confirmDialog, 'submission summary (a missing required answer blocks it)')
      .toBeVisible({ timeout: TIMEOUTS.DIALOG });
    const summary = (await this.confirmDialog.innerText()).replace(/\s+/g, ' ');
    await this.confirmSubmit.click();
    await expect(this.confirmDialog).toBeHidden({ timeout: TIMEOUTS.NAV });
    await expect(this.update, 'Submit Review becomes Update Review once logged').toBeVisible({
      timeout: TIMEOUTS.LIST,
    });
    return { summary, percent: percentIn(summary.match(/Evaluation Score[^%]*%/)?.[0] || '') };
  }

  async leave() {
    await this.backToDashboard.click();
  }
}

class TraineeCallPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.connection = new CallConnection(page);

    // Home page card, before and after the call.
    this.callCardHeading = page.getByRole('heading', { name: /^Buddy Up Consultation/, level: 3 }).first();
    this.joinLive = page.getByRole('button', { name: 'Join Live Call Now' });
    this.joinScheduled = page.getByRole('button', { name: 'Join Review Call' });

    // Live session (/learn?view=practice&meetingId=…)
    this.sessionBar = page.getByText(/^Buddy Up Live Session/).first();
    this.modes = {
      split: page.getByRole('button', { name: 'Split (50/50)' }),
      meeting: page.getByRole('button', { name: 'Meeting Only' }),
      crm: page.getByRole('button', { name: 'CRM Details Only' }),
    };
    this.crm = page.getByText('CRM Lead Details', { exact: true }).first();
    this.videos = page.locator('video');

    this.completedHeading = page.getByRole('heading', { name: /^Buddy Up Consultation with .+ \(Completed\)$/ }).first();
    this.reviewSubmitted = page.getByText('Review Submitted').first();
    this.completedScore = page.getByText(/review results have been logged .*Score: \d+%/).first();
  }

  /** The QA's name as the home-page card prints it: "… Call with <name>" / "… with <name> (Completed)". */
  async cardQaName() {
    const text = await this.callCardHeading.innerText();
    return (text.match(/ with (.+?)(?: \(Completed\))?$/) || [])[1];
  }

  /** "Review call / <QA name>" over the meeting pane. */
  qaNameInCall(qaName) {
    return this.page.getByRole('paragraph').filter({ hasText: new RegExp(`^${escapeRegExp(qaName)}$`) }).first();
  }

  /**
   * Join from the home-page card. Once the QA is in the call the card should switch to
   * "Live Evaluation Call · QA Waiting" with Join Live Call Now, but it has been seen to
   * stay on the scheduled "Join Review Call" until the page is reloaded — so reload once,
   * and if it still hasn't switched, join through the scheduled button, which opens the
   * same session.
   */
  async join() {
    const live = () => this.joinLive.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
    let button = this.joinLive;
    if (!(await live())) {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      if (!(await live())) {
        button = this.joinScheduled;
        await expect(button, 'a Join button on the trainee\'s Buddy Up card').toBeVisible({ timeout: TIMEOUTS.LIST });
      }
    }
    console.log(`Trainee joins via "${(await button.innerText()).trim()}"`);
    await button.click();
    await expect(this.sessionBar).toBeVisible({ timeout: TIMEOUTS.NAV });
    return button === this.joinLive;
  }

  async waitForPeer(qaName) {
    await expect(this.qaNameInCall(qaName), `trainee sees ${qaName} in the call`)
      .toBeVisible({ timeout: BUDDY_TIMEOUTS.CALL_CONNECT });
    await expect(this.videos, 'trainee has a local and a remote video').toHaveCount(2, {
      timeout: BUDDY_TIMEOUTS.CALL_CONNECT,
    });
  }

  async switchView(mode) {
    await this.modes[mode].click({ timeout: TIMEOUTS.DIALOG });
    await this.page.waitForTimeout(1000);
    const video = this.videos.first();
    if (mode !== 'crm') await expect(video, `trainee ${mode}: meeting on screen`).toBeInViewport();
    else await expect(video, 'trainee crm: meeting off screen').not.toBeInViewport();
    if (mode !== 'meeting') await expect(this.crm, `trainee ${mode}: CRM on screen`).toBeInViewport();
    else await expect(this.crm, 'trainee meeting: CRM off screen').not.toBeInViewport();
  }

  /** After the QA submits, the trainee is dropped from the call and shown the outcome. */
  async waitForCompleted() {
    await expect(this.completedHeading, 'Buddy Up shows as completed for the trainee')
      .toBeVisible({ timeout: TIMEOUTS.NAV });
    await expect(this.reviewSubmitted).toBeVisible();
    return percentIn(await this.completedScore.innerText());
  }
}

module.exports = {
  BuddyUpTrainingPage,
  QaLoginPage,
  QaDashboardPage,
  QaCallPage,
  TraineeCallPage,
  percentIn,
};
