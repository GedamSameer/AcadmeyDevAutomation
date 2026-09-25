// tests/pages/AddTraineeDialog.js
//
// The "Add a trainee to <batch>" form the trainer fills by hand, plus its confirmation
// step.

const { expect } = require('@playwright/test');

const { LIMITS, TIMEOUTS } = require('../support/config');
const { CalendarPicker } = require('./CalendarPicker');

class AddTraineeDialog {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} batchName
   */
  constructor(page, batchName) {
    this.page = page;
    this.batchName = batchName;
    this.calendar = new CalendarPicker(page);

    // Named, because the date picker inside the form is a role=dialog popover too — and
    // the title doubles as proof the form is attached to the batch we just created.
    this.root = page.getByRole('dialog', { name: `Add a trainee to ${batchName}` });

    this.fullName = this.root.getByRole('textbox', { name: 'Full name (as per Govt ID)' });
    this.phone = this.root.getByRole('textbox', { name: 'Phone number' });
    this.languages = this.root.getByRole('button', { name: '— ▼' });
    this.employeeId = this.root.getByRole('textbox', { name: 'Employee ID' });
    this.gender = this.root.getByRole('combobox', { name: 'Gender' });
    this.versantScore = this.root.getByRole('textbox', { name: 'Versant score' });
    this.versantTin = this.root.getByRole('textbox', { name: 'Versant TIN' });
    this.submitButton = this.root.getByRole('button', { name: 'Onboard this person' });

    // The form gives way to a confirmation modal; "Onboard this person" is a different
    // button, so exact matching keeps the two apart.
    this.confirmButton = page.getByRole('button', { name: 'Onboard', exact: true });
  }

  async waitForOpen() {
    await expect(this.root).toBeVisible({ timeout: TIMEOUTS.DIALOG });
  }

  async selectLanguages(names = ['English', 'Hindi']) {
    await this.languages.click();
    for (const name of names) {
      await this.page.getByRole('checkbox', { name }).check();
    }
    await this.page.keyboard.press('Escape'); // close the menu so it can't cover the form
  }

  async fill(trainee) {
    await this.fullName.fill(trainee.fullName);
    await this.phone.fill(trainee.phone);

    await this.selectLanguages();

    await this.employeeId.fill(trainee.employeeId);

    await this.gender.click();
    await this.page.getByRole('option', { name: trainee.gender, exact: true }).click();

    await this.versantScore.fill(trainee.versantScore);
    await this.versantTin.fill(trainee.versantTin);

    await this.calendar.pickBirthDate(this.root, trainee.dob);
  }

  /**
   * Submit, then the confirmation step. The button stays disabled while any batch-level
   * field is missing, and the form prints what it is waiting for — so that text becomes
   * the assertion message.
   */
  async submit() {
    const blockedBy = await this.root
      .innerText()
      .then((t) => (t.match(/still needed:[^\n]*/i) || ['submit blocked by the form'])[0]);
    await expect(this.submitButton, blockedBy).toBeEnabled({ timeout: TIMEOUTS.DIALOG });

    // Click, then check the click actually landed. A popover on its way out — the date
    // picker, usually — can swallow it and leave the form sitting there looking untouched
    // and perfectly valid, which is indistinguishable from a submit that was never made.
    for (let attempt = 1; attempt <= LIMITS.MAX_SUBMIT_CLICKS; attempt++) {
      await this.submitButton.click();

      const landed = await this.confirmButton
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (landed) break;

      console.log(`Submit click ${attempt} did not register — clicking again`);
    }

    await expect(this.confirmButton, 'confirmation step after submitting the form')
      .toBeVisible({ timeout: TIMEOUTS.LIST });
    await this.confirmButton.click();
    await expect(this.root).toBeHidden({ timeout: TIMEOUTS.NAV });
  }
}

module.exports = { AddTraineeDialog };