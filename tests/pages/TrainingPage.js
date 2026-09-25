// tests/pages/TrainingPage.js
//
// Everything the trainee sees once logged in: the join gate, and Day 1 itself.

const { expect } = require('@playwright/test');

const { LIMITS, TIMEOUTS } = require('../support/config');
const { BasePage } = require('./BasePage');

class TrainingPage extends BasePage {
  constructor(page) {
    super(page);
    this.batchCode = page.getByRole('textbox', { name: 'Batch code' });
    this.verifyAndStart = page.getByRole('button', { name: 'Verify & start training' });
    this.continueTraining = page.getByRole('link', { name: /Continue Training/i }).first();
  }

  /** The join gate every trainee hits before any content unlocks. */
  async joinBatch(batchCode) {
    await expect(this.batchCode).toBeVisible({ timeout: TIMEOUTS.NAV });
    await this.batchCode.fill(batchCode);

    await expect(this.verifyAndStart).toBeEnabled();
    await this.verifyAndStart.click();

    // Gate cleared — the trainee is in the batch.
    // TODO: extend past this point once the module / quiz steps are recorded.
    await expect(this.batchCode).toBeHidden({ timeout: TIMEOUTS.NAV });
  }

  /**
   * Click through a slide deck, if the open resource has one. The deck lives in an iframe
   * ("Day 1 - Welcome To Traya") — 31 slides on Day 1. Returns how many slides were turned.
   *
   * Slides are advanced the way a reader does it: a click on the right-hand side of the
   * slide, vertically centred, rather than on the deck's Next page control. That control is
   * still read — never clicked — because its state is what says whether a slide is left.
   */
  async pageThroughDeck() {
    const deck = this.page.locator('iframe').first();
    if (!(await deck.count())) return 0;

    await deck.scrollIntoViewIfNeeded().catch(() => {});
    const next = deck.contentFrame().getByRole('button', { name: 'Next page' });
    let slides = 0;

    while (
      slides < LIMITS.MAX_DECK_PAGES &&
      (await next.isVisible().catch(() => false)) &&
      (await next.isEnabled().catch(() => false))
    ) {
      const slide = await deck.boundingBox();
      if (!slide) break;

      // 90% across, halfway down — inside the slide, clear of the edge.
      await this.page.mouse.click(slide.x + slide.width * 0.9, slide.y + slide.height / 2);
      slides++;
      await this.page.waitForTimeout(500);
    }

    return slides;
  }

  /**
   * Walk the trainee's day: open each resource in turn, read it, mark it done, and stop at
   * the first test. Returns the "Start test" button, or null if no test came up.
   *
   * Every resource offers exactly one of four things, so the loop just follows whichever
   * the screen shows:
   *   "Continue to <resource>"      the entry point on /learn
   *   a deck + "Review first (Ns)"  a *disabled* countdown that becomes "Mark done"
   *   "Mark done"                   the step is complete
   *   "Start test"                  the end of the reading, and where we stop
   *
   * The countdown is why this is slow: two gates of ~2 minutes each stand before the test.
   */
  async workThroughTraining() {
    await this.continueTraining.click();

    for (let step = 1; step <= LIMITS.MAX_TRAINING_STEPS; step++) {
      const startTest = this.page.getByRole('button', { name: /^\s*Start test\s*$/i }).first();
      const markDone = this.page.getByRole('button', { name: /^\s*Mark done\s*$/i }).first();
      const continueTo = this.page.getByRole('button', { name: /^\s*Continue to / }).first();
      const review = this.page.getByRole('button', { name: /^\s*Review first \(\d+s\)/i }).first();

      await expect(
        startTest.or(markDone).or(continueTo).or(review).first(),
        'a training resource to act on'
      ).toBeVisible({ timeout: TIMEOUTS.BRANCH });

      if (await startTest.isVisible()) return startTest;

      if (await continueTo.isVisible()) {
        console.log(
          `Training step ${step}: ${(await continueTo.innerText()).replace(/\s+/g, ' ').trim()}`
        );
        await continueTo.click();
        await this.page.waitForTimeout(2000);
        continue;
      }

      const slides = await this.pageThroughDeck();
      if (slides) console.log(`Training step ${step}: paged ${slides} slide(s)`);

      // Wait out the review gate: the countdown turns into "Mark done" on its own.
      await expect(markDone.or(startTest).first(), 'review gate to open')
        .toBeVisible({ timeout: TIMEOUTS.REVIEW_GATE });

      if (await startTest.isVisible()) return startTest;
      await markDone.click();
      await this.page.waitForTimeout(2000);
    }

    return null;
  }
}

module.exports = { TrainingPage };