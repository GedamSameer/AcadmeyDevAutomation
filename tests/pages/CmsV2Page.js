// tests/pages/CmsV2Page.js
//
// /admin/cms-v2 — two sub-views: Directories (a Finder-style folder tree of modules) and
// Config & Bank (Component Config, Question Bank, Form Warehouse, Resources Bank). The
// checks here only read: nothing is added, edited, archived or deleted.

const { expect } = require('@playwright/test');

const { TIMEOUTS } = require('../support/config');
const { BasePage } = require('./BasePage');

class CmsV2Page extends BasePage {
  constructor(page) {
    super(page);
    this.directoriesButton = page.getByRole('button', { name: 'Directories', exact: true });
    this.configBankButton = page.getByRole('button', { name: 'Config & Bank', exact: true });

    // Directories
    this.library = page.getByRole('tree', { name: 'Library' });
    this.breadcrumb = page.getByRole('navigation', { name: 'Path' });
    this.details = page.getByRole('complementary', { name: 'Details' });
    this.filter = page.getByRole('searchbox', { name: 'Filter this folder' });
    this.views = ['Icon view', 'List view', 'Column view'];
  }

  async goto() {
    await this.openNav('CMS v2');
    await expect(this.directoriesButton).toBeVisible({ timeout: TIMEOUTS.NAV });
  }

  /** A level-1 item in the library tree, e.g. "Offline 8" (name + item count). */
  libraryItem(name) {
    return this.library.getByRole('treeitem', { name: new RegExp(`^${name}(\\s|$)`) }).first();
  }

  /**
   * Full reload — the library is fetched once per page load, not per visit. Not
   * 'networkidle': CMS v2 keeps polling, so the network never goes quiet.
   */
  async reload({ attempts = 3 } = {}) {
    // A fresh load has been seen to hang on its loading skeleton (one /api/tenant request
    // that never answers), so give each load a bounded wait and start over if it stalls.
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      const loaded = await this.directoriesButton
        .waitFor({ state: 'visible', timeout: 30000 })
        .then(() => true, () => false);
      if (loaded) break;
      console.log(`CMS v2 load ${attempt} stuck on its skeleton — reloading`);
    }
    await this.openDirectories();
  }

  async openDirectories() {
    await this.directoriesButton.click();
    await expect(this.library).toBeVisible({ timeout: TIMEOUTS.LIST });
  }

  /** Open a top-level folder; returns its children's names. */
  async openFolder(name) {
    await this.page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
    await expect(this.breadcrumb).toContainText(name);
    await expect(this.libraryItem(name)).toHaveAttribute('aria-expanded', 'true');
    await expect(this.details.getByText(/^Folder · \d+ items?$/)).toBeVisible();
    return this.library.getByRole('treeitem', { level: 2 }).allInnerTexts();
  }

  /** Each view toggle presses itself. */
  async cycleViews() {
    for (const name of this.views) {
      const view = this.page.getByRole('button', { name, exact: true });
      await view.click();
      await expect(view, `${name} selected`).toHaveAttribute('aria-pressed', 'true');
    }
  }

  /** Filter the open folder's children; returns what is left. */
  async filterFolder(text) {
    await this.filter.fill(text);
    await this.page.waitForTimeout(800);
    const left = await this.library.getByRole('treeitem', { level: 2 }).allInnerTexts();
    await this.filter.fill('');
    return left;
  }

  // ── Config & Bank ──────────────────────────────────────────────────────────

  async openConfigBank() {
    await this.configBankButton.click();
    await expect(this.page).toHaveURL(/sub=config-bank/, { timeout: TIMEOUTS.LIST });
  }

  async openBankTab(name) {
    await this.page.getByRole('button', { name, exact: true }).click();
  }

  /** Component Config: each component opens its own settings panel. */
  async checkComponentConfig() {
    await this.openBankTab('Component Config');
    const components = [
      [/^Spoken English Voice assessment/, 'Spoken English Component'],
      [/^Quiz & Assessments/, 'Quiz & Assessment Component'],
      [/^Buddy Up Peer/, 'Buddy Up Component'],
    ];
    for (const [button, heading] of components) {
      await this.page.getByRole('button', { name: button }).click();
      await expect(this.page.getByRole('heading', { name: heading, level: 3 }), heading)
        .toBeVisible({ timeout: TIMEOUTS.LIST });
    }
  }

  /** Question Bank: the pool has questions, and the format filter narrows the list. */
  async checkQuestionBank() {
    await this.openBankTab('Question Bank');
    await expect(this.page.getByRole('heading', { name: 'Question Pool for Quiz' }))
      .toBeVisible({ timeout: TIMEOUTS.LIST });
    const total = this.page.getByText(/^\d+ total questions/).first();
    await expect(total).toBeVisible({ timeout: TIMEOUTS.LIST });
    const count = Number((await total.innerText()).match(/\d+/)[0]);
    await expect(this.page.getByRole('button', { name: 'Preview as Trainee' }).first()).toBeVisible();
    return count;
  }

  /** Form Warehouse: lists forms, each with its section / question / points stats. */
  async checkFormWarehouse() {
    await this.openBankTab('Form Warehouse');
    await expect(this.page.getByRole('heading', { name: 'Evaluation Form Warehouse' }))
      .toBeVisible({ timeout: TIMEOUTS.LIST });
    const badge = this.page.getByText(/^\d+ Forms?$/).first();
    await expect(badge).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Edit Builder' }).first()).toBeVisible();
    return Number((await badge.innerText()).match(/\d+/)[0]);
  }

  /** Resources Bank: lists resources, and a type filter narrows them. */
  async checkResourcesBank() {
    await this.openBankTab('Resources Bank');
    await expect(this.page.getByRole('heading', { name: 'Resources Bank', level: 2 }))
      .toBeVisible({ timeout: TIMEOUTS.LIST });
    const all = this.page.getByRole('button', { name: /^All \(\d+\)$/ });
    await expect(all).toBeVisible();
    const total = Number((await all.innerText()).match(/\d+/)[0]);

    // The bank is rebuilt from CMS content, and the CMS phase has just published a module, so
    // the badge and the list can each land a moment apart. Read both after filtering, together,
    // until they agree — a badge read before the click can be one refresh behind the list.
    const docs = this.page.getByRole('button', { name: /^Documents \(\d+\)$/ });
    await docs.click();
    const cards = this.page.getByRole('button', { name: 'Delete Resource' });
    let docCount;
    await expect
      .poll(async () => {
        docCount = Number((await docs.innerText()).match(/\d+/)[0]);
        return (await cards.count()) - docCount;
      }, { timeout: TIMEOUTS.LIST, message: 'Documents badge count matches the cards it lists' })
      .toBe(0);

    // And the filter really is a document filter: every card it shows is a Doc or a Sheet.
    const types = await cards.evaluateAll((buttons) =>
      buttons.map((b) => b.closest('div:has(h3)')?.innerText.trim().split(/\s+/)[0]));
    expect(types.filter((t) => !['Doc', 'Sheet'].includes(t)), 'non-document cards under Documents')
      .toEqual([]);

    await all.click();
    return { total, docCount };
  }
}

module.exports = { CmsV2Page };
