// tests/pages/BatchManagementPage.js
//
// /admin/batches is a two-pane screen: a searchable list of batch cards on the left,
// the selected batch on the right. Selecting a batch does NOT change the URL, so a
// reload drops you back on the default batch — always re-select after reloading.

const { expect } = require('@playwright/test');
const { faker } = require('@faker-js/faker');

const { BATCH_NO_RANGE, LIMITS, TIMEOUTS } = require('../support/config');
const { batchNameFor, escapeRegExp } = require('../support/naming');
const { BasePage } = require('./BasePage');
const { AddTraineeDialog } = require('./AddTraineeDialog');

class BatchManagementPage extends BasePage {
  constructor(page) {
    super(page);
    this.search = page.getByRole('textbox', { name: /search cohorts/i });
    this.addTrainee = page.getByRole('button', { name: '+ Add Trainee' });
    this.activeTab = page.getByRole('button', { name: /^Active \(\d+\)$/ });
    this.startBatchButton = page.getByRole('button', { name: /^\s*Start batch\s*$/i }).first();
  }

  async goto() {
    await this.navLink('Batch Management').click();
    await expect(this.search).toBeVisible({ timeout: TIMEOUTS.LIST });
  }

  /** A batch card, matched on the leading batch name inside its accessible name. */
  card(batchName) {
    return this.page.getByRole('button', {
      name: new RegExp(`^${escapeRegExp(batchName).replace(/\\?\s+/g, '\\s+')}\\s`),
    });
  }

  /** Narrow the card list; the search box is debounced, hence the settle. */
  async searchFor(text) {
    await expect(this.search).toBeVisible({ timeout: TIMEOUTS.LIST });
    await this.search.fill(text);
    await this.page.waitForTimeout(1200);
  }

  /** A batch number no existing batch is using, so the name stays unique. */
  async pickFreeBatchNo() {
    for (let i = 0; i < LIMITS.MAX_BATCH_NO_TRIES; i++) {
      const candidate = String(faker.number.int(BATCH_NO_RANGE));
      await this.searchFor(batchNameFor(candidate));
      if ((await this.card(batchNameFor(candidate)).count()) === 0) return candidate;
    }
    throw new Error('Could not find an unused batch number — widen BATCH_NO_RANGE.');
  }

  /** Search -> open the batch. Returns its card. */
  async openBatch(batchName, { attempts = 10 } = {}) {
    const card = this.card(batchName).first();

    // Re-query rather than wait. The list is fetched once per page load, so a batch created
    // moments ago never appears just because we stand still — and creating a five-person
    // batch has taken well over 30s. Each retry reloads, which refetches, then searches.
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        await this.page.reload({ waitUntil: 'networkidle' });
        await this.page.waitForTimeout(1000);
      }
      await this.searchFor(batchName);
      if (await card.isVisible().catch(() => false)) break;
      if (attempt < attempts) await this.page.waitForTimeout(4000);
    }

    await expect(card, `batch "${batchName}" in Batch Management`)
      .toBeVisible({ timeout: TIMEOUTS.NAV });
    await card.click();

    // Right pane header — confirms the click actually selected this batch.
    await expect(this.page.getByRole('heading', { name: batchName, exact: true, level: 2 }))
      .toBeVisible({ timeout: TIMEOUTS.LIST });

    this.selectedCard = card;
    return card;
  }

  /**
   * The join code the trainee types at "Verify & start training" is printed on the batch
   * card itself, under the name/status:
   * "Example Partner Example City Offline 85 / Not Started / 2REX9J / Offline".
   */
  async readBatchCode(card = this.selectedCard) {
    const text = await card.innerText();
    const line = text
      .split('\n')
      .map((s) => s.trim())
      .find((s) => /^[0-9A-Z]{6,10}$/.test(s));
    return line || null;
  }

  /** How many trainees are in the open batch, off the Active tab's counter. */
  async activeCount() {
    return Number((await this.activeTab.innerText()).match(/\d+/)[0]);
  }

  /** The row for one trainee in the open batch's Trainees table. */
  traineeRow(fullName) {
    return this.page.getByRole('row').filter({ hasText: fullName }).first();
  }

  /**
   * The Add Trainee button inside the batch inherits the batch — the dialog title says so.
   * Returns the opened dialog, already asserted visible.
   */
  async openAddTraineeDialog(batchName) {
    await this.addTrainee.click();
    const dialog = new AddTraineeDialog(this.page, batchName);
    await dialog.waitForOpen();
    return dialog;
  }

  /** Trainer starts the batch so training opens up for its trainees. */
  async startBatch() {
    const start = this.startBatchButton;

    await expect(start, 'Start batch button (only shown while a batch is Not Started)')
      .toBeVisible({ timeout: TIMEOUTS.LIST });
    await start.click();

    // Confirmation dialog, if there is one — the confirm button usually repeats the verb.
    const confirm = this.page
      .getByRole('button', { name: /^\s*(Start batch|Start|Confirm|Yes)\s*$/i })
      .last();
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirm.click();
    }

    // The button only exists while the batch is Not Started, so it going away is the signal.
    await expect(start).toBeHidden({ timeout: TIMEOUTS.LIST });
  }
}

module.exports = { BatchManagementPage };