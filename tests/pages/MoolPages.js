// tests/pages/MoolPages.js
//
// The Mool Health workspace is the same Academy app as Traya, so these extend the Traya
// page objects and override only what differs: which workspace tile to enter, and the
// partner / location / batch name the onboarding wizard uses.

const { faker } = require('@faker-js/faker');

const { BATCH_NO_RANGE, LIMITS } = require('../support/config');
const { MOOL_PARTNER_OPTION, MOOL_LOCATION_OPTION } = require('../support/mool.config');
const { moolBatchNameFor } = require('../support/mool.state');
const { LoginPage } = require('./LoginPage');
const { OnboardingPage } = require('./OnboardingPage');
const { BatchManagementPage } = require('./BatchManagementPage');

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

module.exports = { MoolLoginPage, MoolOnboardingPage, MoolBatchManagementPage };
