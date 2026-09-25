// tests/pages/OnboardingPage.js
//
// The bulk-onboarding wizard the onboarding specialist uses: upload a sheet, set the
// batch-wide fields, review the day-by-day schedule, and create the batch.

const { expect } = require('@playwright/test');

const {
  MANAGER_EMAIL,
  MANAGER_FIELD_PLACEHOLDER,
  PARTNER_OPTION,
  LOCATION_OPTION,
  MODULE_OPTION,
  LIMITS,
  TIMEOUTS,
} = require('../support/config');
const { today, tomorrow } = require('../support/dates');
const { BasePage } = require('./BasePage');

class OnboardingPage extends BasePage {
  constructor(page) {
    super(page);
    this.house = page.getByRole('combobox', { name: 'House' });
    this.sampleSheet = page.getByRole('button', { name: 'Sample sheet' });
    this.upload = page.getByLabel('Upload .csv / .xlsx');
    this.emailFields = page.getByRole('textbox', { name: MANAGER_FIELD_PLACEHOLDER });
    this.cohort = page.getByRole('combobox', { name: 'Group (cohort)' });
    // The schedule stepper's Next Day control has no accessible name of its own.
    this.nextDay = page.locator('.px-6 > .flex.items-center.gap-1 > button:nth-child(3)');
    this.looksGood = page.getByRole('button', { name: /Looks Good/i });
    this.partner = page.getByRole('combobox', { name: 'Partner name' });
    this.location = page.getByRole('combobox', { name: 'Partner location' });
    this.batchNoField = page.getByRole('textbox', { name: 'Batch No.' });
    this.confirmOnboard = page.getByRole('button', { name: 'Onboard', exact: true });
  }

  async goto() {
    await this.openNav('Onboarding');
  }

  async selectHouse(name = 'Out Source') {
    await this.house.click();
    await this.page.getByRole('option', { name }).click();
  }

  /** Download the sample sheet and assert it is the format we then upload. */
  async downloadSampleSheet() {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.sampleSheet.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.(csv|xlsx)$/);
    return download;
  }

  async uploadSheet(csvPath) {
    await this.upload.setInputFiles(csvPath);
  }

  /**
   * Reporting manager + team leader — two batch-wide fields, not one per row.
   *
   * Each one resolves the typed address to a CRM user *on blur* and swaps in that
   * person's display name. Filling both in a loop only blurs the first, so the team
   * leader silently stays unresolved, the batch is created without one, and the Add
   * Trainee form in the trainer phase then refuses with "still needed: team leader".
   * Hence the explicit Tab and the check that the field stopped showing the raw address.
   */
  async fillManagerEmails(email = MANAGER_EMAIL) {
    const fields = await this.emailFields.all();
    expect(fields.length, 'reporting manager + team leader fields').toBe(2);
    for (const field of fields) {
      await field.fill(email);
      await field.press('Tab');
      await expect(field, `${email} must resolve to a CRM user`)
        .not.toHaveValue(email, { timeout: TIMEOUTS.LIST });
    }
  }

  /** Cohort — this is the "Module" part of the batch name. */
  async selectCohort(module = MODULE_OPTION) {
    await this.cohort.click();
    await this.page.getByRole('option', { name: module, exact: true }).click();
  }

  /** Step through every training day — the Next Day button disables on the last one. */
  async reviewSchedule() {
    await expect(this.nextDay).toBeVisible();
    for (let i = 0; i < LIMITS.MAX_DAY_STEPS; i++) {
      if (await this.looksGood.isEnabled()) break;
      if (!(await this.nextDay.isEnabled())) break;
      await this.nextDay.click();
    }

    await expect(this.looksGood).toBeEnabled();
    await this.looksGood.click();
  }

  /** Partner + location — the first two parts of the batch name. */
  async selectPartnerAndLocation() {
    await this.partner.click();
    await this.page.getByRole('option', { name: PARTNER_OPTION }).click();
    await this.location.click();
    await this.page.getByRole('option', { name: LOCATION_OPTION }).click();
  }

  /**
   * Date of joining = today; training start = the earliest day the picker allows from
   * tomorrow onwards (it blocks the next few days).
   */
  async pickDates() {
    const doj = await this.calendar.pickAtOrAfter(today());
    const trainingStart = await this.calendar.pickAtOrAfter(tomorrow());
    console.log(`DOJ ${doj.toDateString()} · training starts ${trainingStart.toDateString()}`);
    return { doj, trainingStart };
  }

  async setBatchNo(batchNo) {
    await this.batchNoField.fill(String(batchNo));
  }

  async createBatch(count) {
    await this.page
      .locator(`//button[normalize-space()='Create & onboard ${count} people']`)
      .click();
    await this.confirmOnboard.click();
  }
}

module.exports = { OnboardingPage };