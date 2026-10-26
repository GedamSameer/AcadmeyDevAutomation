// tests/pages/TraineeProfilePage.js
//
// /trainee/<id> — the profile the trainer reaches from a name in the batch table. Only
// the Role field is driven here.

const { expect } = require('@playwright/test');

const { TIMEOUTS } = require('../support/config');
const { BasePage } = require('./BasePage');

class TraineeProfilePage extends BasePage {
  constructor(page) {
    super(page);
    this.name = page.getByRole('heading', { level: 1 });
    // A custom combobox (button + listbox), so it is clicked open rather than selectOption'd.
    this.role = page.getByRole('combobox', { name: 'Training role' });
  }

  async waitForOpen(fullName) {
    await expect(this.name).toHaveText(fullName, { timeout: TIMEOUTS.NAV });
    await expect(this.role).toBeVisible({ timeout: TIMEOUTS.LIST });
  }

  /** Change the role, then reload to prove it was saved rather than just shown. */
  async setRole(role) {
    await this.role.click();
    await this.page.getByRole('option', { name: role, exact: true }).click();
    await expect(this.role).toHaveText(role, { timeout: TIMEOUTS.DIALOG });

    await this.page.reload({ waitUntil: 'networkidle' });
    await expect(this.role, `role still ${role} after reload`).toHaveText(role, { timeout: TIMEOUTS.LIST });
  }
}

module.exports = { TraineeProfilePage };
