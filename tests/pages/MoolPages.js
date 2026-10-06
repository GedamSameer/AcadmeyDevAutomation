// tests/pages/MoolPages.js
//
// The Mool Health workspace is the same Academy app as Traya, so these extend the Traya
// page objects and override only what differs: which workspace tile to enter, and the
// partner / location / batch name the onboarding wizard uses.

const { expect } = require('@playwright/test');
const { faker } = require('@faker-js/faker');

const { BATCH_NO_RANGE, LIMITS, TIMEOUTS } = require('../support/config');
const { MOOL_PARTNER_OPTION, MOOL_LOCATION_OPTION, MOOL_TIMEOUTS } =
  require('../support/mool.config');
const { moolBatchNameFor } = require('../support/mool.state');
const { LoginPage } = require('./LoginPage');
const { OnboardingPage } = require('./OnboardingPage');
const { BatchManagementPage } = require('./BatchManagementPage');
const { TrainingPage } = require('./TrainingPage');

class MoolLoginPage extends LoginPage {
  constructor(page) {
    super(page);
    // login() clicks this after Verify — the workspace picker lists every tenant.
    this.enterWorkspace = page.locator("//h3[normalize-space()='Mool Health']");
  }
}

class MoolOnboardingPage extends OnboardingPage {
  async goto() {
    await this.navLink('Onboarding').click();
    await this.house.waitFor({ state: 'visible' });
  }

  async selectPartnerAndLocation(partner = MOOL_PARTNER_OPTION, location = MOOL_LOCATION_OPTION) {
    await this.partner.click();
    await this.page.getByRole('option', { name: partner }).click();
    await this.location.click();
    await this.page.getByRole('option', { name: location }).click();
  }

  /**
   * Create, confirm, then wait for the result line the wizard prints once every account
   * is processed — "0 created, 1 already had accounts, 0 failed". The counts vary run to
   * run; only "0 failed" lets the flow move on. Returns the three counts.
   */
  async createBatch(count) {
    await super.createBatch(count);

    const summary = this.page
      .getByText(/\d+\s+created,\s*\d+\s+already had accounts?,\s*\d+\s+failed/i)
      .first();
    await expect(summary, 'onboarding result summary after clicking Onboard')
      .toBeVisible({ timeout: MOOL_TIMEOUTS.ONBOARD_SUMMARY });

    const text = (await summary.innerText()).replace(/\s+/g, ' ').trim();
    const [, created, existing, failed] = text
      .match(/(\d+)\s+created,\s*(\d+)\s+already had accounts?,\s*(\d+)\s+failed/i)
      .map(Number);
    console.log(`Onboard result: ${text}`);

    expect(failed, `no failed accounts — "${text}"`).toBe(0);
    return { created, existing, failed };
  }
}

class MoolBatchManagementPage extends BatchManagementPage {
  /** Same as the parent, but checked against the Mool batch name. */
  async pickFreeBatchNo() {
    for (let i = 0; i < LIMITS.MAX_BATCH_NO_TRIES; i++) {
      const candidate = String(faker.number.int(BATCH_NO_RANGE));
      await this.searchFor(moolBatchNameFor(candidate));
      if ((await this.card(moolBatchNameFor(candidate)).count()) === 0) return candidate;
    }
    throw new Error('Could not find an unused batch number — widen BATCH_NO_RANGE.');
  }
}

class MoolTrainingPage extends TrainingPage {
  constructor(page) {
    super(page);
    // Mool may ask for a daily check-in remark after Continue Training.
    this.checkInRemark = page.locator("//textarea[@id='checkin-remark']");
    this.checkInAndStart = page.locator("//button[normalize-space()='Check in & start the day']");
  }

  /** The check-in popup opens once Continue Training is clicked. */
  async afterEnteringTraining() {
    await this.checkIn();
  }

  /** Fills the check-in popup if it shows up; otherwise carries on with the normal flow. */
  async checkIn(remark = 'Good') {
    const prompted = await this.checkInRemark
      .waitFor({ state: 'visible', timeout: TIMEOUTS.DIALOG })
      .then(() => true, () => false);
    if (!prompted) {
      console.log('Mool: no check-in popup — continuing');
      return;
    }

    await this.checkInRemark.fill(remark);

    await expect(this.checkInAndStart).toBeEnabled();
    await this.checkInAndStart.click();
    await expect(this.checkInRemark).toBeHidden({ timeout: TIMEOUTS.NAV });
  }
}

module.exports = { MoolLoginPage, MoolOnboardingPage, MoolBatchManagementPage, MoolTrainingPage };
