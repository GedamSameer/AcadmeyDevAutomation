// tests/pages/BasePage.js
//
// What every screen in the workspace shares: the sidebar, the walkthrough overlay, and
// the date picker.

const { BASE_URL, LIMITS } = require('../support/config');
const { CalendarPicker } = require('./CalendarPicker');

class BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.calendar = new CalendarPicker(page);
  }

  async gotoRoot() {
    await this.page.goto(BASE_URL);
  }

  /**
   * Sidebar links only. The home page also renders one <a> per role programme, several of
   * which contain the word "Onboarding", so an unscoped getByRole('link') is a strict-mode
   * violation waiting to happen. `exact` also keeps "Batch Management" away from the
   * "Admin Dashboard" link that points at the same URL.
   */
  navLink(name) {
    return this.page.getByRole('navigation').getByRole('link', { name, exact: true });
  }

  /**
   * Landing in the workspace can raise a walkthrough — the trainer usually gets the
   * "start a batch" prompt. It comes in stacked steps, each with its own Skip, and until
   * they are all gone the overlay eats clicks meant for the page behind it. So: click
   * every Skip that turns up, not just the first. A no-op when no walkthrough appears.
   */
  async dismissWalkthrough() {
    const deadline = Date.now() + LIMITS.WALKTHROUGH_BUDGET;
    let skipped = 0;

    for (let i = 0; i < LIMITS.MAX_SKIP_CLICKS && Date.now() < deadline; i++) {
      const skip = this.page
        .getByRole('button', { name: /^\s*Skip\s*$/i })
        .filter({ visible: true })
        .first();

      // The first prompt lands ~5-6s after the workspace does, so the opening look has to
      // be patient; later looks only ask whether another step followed, but still allow
      // for one rendering as slowly as the first.
      const budget = Math.max(1000, Math.min(i === 0 ? 12000 : 4000, deadline - Date.now()));
      const shown = await skip
        .waitFor({ state: 'visible', timeout: budget })
        .then(() => true)
        .catch(() => false);
      if (!shown) break;

      // Bounded on purpose. The project sets no actionTimeout, so a bare click() on a
      // button that is visible but covered retries until the whole *test* runs out — a
      // dismissal helper that quietly eats a four-minute budget. Give up on a step instead.
      const clicked = await skip
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false); // a step can tear itself down mid-click
      if (clicked) skipped++;
      await this.page.waitForTimeout(500);
    }

    if (skipped) console.log(`Skipped ${skipped} walkthrough step(s)`);
    return skipped;
  }
}

module.exports = { BasePage };