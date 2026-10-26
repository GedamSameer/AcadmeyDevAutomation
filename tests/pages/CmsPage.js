// tests/pages/CmsPage.js
//
// /admin/cms — the Training Module CMS (v1). One tab per module; "Sheet view" shows the
// open module as an editable sheet with a Download .xlsx button, and the "+ Add new" tab
// takes an .xlsx back in as a brand-new module.

const path = require('path');
const { expect } = require('@playwright/test');

const { TIMEOUTS } = require('../support/config');
const { BasePage } = require('./BasePage');

class CmsPage extends BasePage {
  constructor(page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Training Module CMS', level: 1 });
    this.sheetView = page.getByRole('button', { name: 'Sheet view' });
    this.downloadXlsx = page.getByRole('button', { name: 'Download .xlsx' });
    this.addNewTab = page.getByRole('tab', { name: '+ Add new' });

    // The "Add a new training module" panel.
    this.upload = page.getByLabel('Upload .xlsx / .csv');
    this.trackName = page.getByRole('textbox', { name: 'e.g. PC' });
    this.publish = page.getByRole('button', { name: 'Publish track' });
    // "1 days · 5 resources · 1 test (5 questions) · all checks passed" — the parse summary.
    this.summary = page.getByText(/\d+ days? · \d+ resources?/).first();
  }

  async goto() {
    await this.openNav('CMS');
    await expect(this.heading).toBeVisible({ timeout: TIMEOUTS.NAV });
  }

  moduleTab(name) {
    return this.page.getByRole('tab', { name, exact: true });
  }

  /** Open a module in Sheet view and return its "N days · N resources · …" summary. */
  async openModuleSheet(name) {
    await this.moduleTab(name).click();
    await expect(this.moduleTab(name)).toHaveAttribute('aria-selected', 'true');
    await this.sheetView.click();
    await expect(this.downloadXlsx).toBeVisible({ timeout: TIMEOUTS.LIST });
    return (await this.summary.innerText()).trim();
  }

  /** Download the open module as .xlsx into `dir`; returns the saved path. */
  async downloadModule(dir) {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.downloadXlsx.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const file = path.join(dir, `${Date.now()}-${download.suggestedFilename()}`);
    await download.saveAs(file);
    return file;
  }

  /**
   * "+ Add new" -> upload the sheet -> name it -> Publish. The upload is parsed in the
   * browser first; Publish stays disabled until every check passes, so its state (and the
   * summary line, which names what is left to fix) is the assertion.
   */
  async createModuleFromFile(file, trackName) {
    await this.addNewTab.click();
    await this.upload.setInputFiles(file);
    await expect(this.trackName).toBeVisible({ timeout: TIMEOUTS.LIST });
    await this.trackName.fill(trackName);

    await expect(this.summary, 'uploaded module passes every check').toContainText('all checks passed', {
      timeout: TIMEOUTS.LIST,
    });
    await expect(this.publish).toBeEnabled();
    const summary = (await this.summary.innerText()).trim();

    await this.publish.click();
    // Publishing opens the new module's own tab.
    await expect(this.moduleTab(trackName), `new module tab "${trackName}"`)
      .toHaveAttribute('aria-selected', 'true', { timeout: TIMEOUTS.NAV });
    return summary;
  }
}

module.exports = { CmsPage };
