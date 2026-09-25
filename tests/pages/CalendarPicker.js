// tests/pages/CalendarPicker.js
//
// The date-picker popover, which shows up in both the onboarding wizard (date of joining,
// training start) and the Add Trainee dialog (date of birth). It renders at page level
// even when the field that opened it lives inside a dialog, hence the two locators in
// pickBirthDate.

const { expect } = require('@playwright/test');
const { addDays, dayLabel } = require('../support/dates');

class CalendarPicker {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  /** The popover itself — a dialog that contains a grid, which the other dialogs don't. */
  popover() {
    return this.page.getByRole('dialog').filter({ has: this.page.getByRole('grid') });
  }

  /** Buttons for date fields that haven't been filled yet. */
  unsetFields(scope = this.page) {
    return scope.getByRole('button', { name: 'Pick a date' });
  }

  /**
   * Open the next unset date field. `.first()` is deliberate: once a field is filled its
   * button stops saying "Pick a date", so the first match is always the next one to set.
   */
  async open() {
    await this.unsetFields().first().click();
    const calendar = this.popover().last();
    await expect(calendar).toBeVisible({ timeout: 15000 });
    return calendar;
  }

  /** Show the month `date` falls in, via the picker's month/year selects. */
  async showMonthOf(calendar, date) {
    await calendar.getByLabel('Choose the Year').selectOption(String(date.getFullYear()));
    await calendar.getByLabel('Choose the Month').selectOption(String(date.getMonth()));
  }

  /**
   * Fill the next unset date field with the first selectable day on or after `preferred`,
   * and return the date actually chosen.
   *
   * An exact date can't be assumed: the training start picker greys out the next few days
   * (on 22 Sep it offered nothing before the 27th), so "tomorrow" is a preference, not a
   * requirement. Walking forward a day at a time also avoids the old "day not on screen ->
   * click next month" guess, which paged past the target whenever the popup was still
   * rendering.
   */
  async pickAtOrAfter(preferred, maxDays = 45) {
    const fieldsLeft = await this.unsetFields().count();
    const calendar = await this.open();

    let shownMonth = null;
    for (let i = 0; i <= maxDays; i++) {
      const candidate = addDays(preferred, i);
      const stamp = `${candidate.getFullYear()}-${candidate.getMonth()}`;
      if (stamp !== shownMonth) {
        await this.showMonthOf(calendar, candidate);
        shownMonth = stamp;
      }

      const day = calendar.getByRole('button', { name: dayLabel(candidate) }).first();
      if (!(await day.isVisible().catch(() => false))) continue;
      if (!(await day.isEnabled().catch(() => false))) continue;

      await day.click();
      // The field swaps "Pick a date" for the chosen date, so the count dropping is proof
      // the value stuck — and it leaves the next unset field as the new `.first()`.
      await expect(this.unsetFields()).toHaveCount(fieldsLeft - 1, { timeout: 15000 });
      await expect(this.popover()).toHaveCount(0, { timeout: 15000 });
      return candidate;
    }

    throw new Error(
      `No selectable date within ${maxDays} days of ${preferred.toDateString()} in the picker.`
    );
  }

  /**
   * Date of birth picker — jumps straight to the year/month via the two selects.
   * `scope` is the form that owns the field (the Add Trainee dialog).
   */
  async pickBirthDate(scope, date) {
    await this.unsetFields(scope).first().click();
    await this.page.getByLabel('Choose the Year').selectOption(String(date.getFullYear()));
    await this.page.getByLabel('Choose the Month').selectOption(String(date.getMonth()));
    await this.page.getByRole('button', { name: dayLabel(date) }).first().click();

    // The popover closes on its own, but on the way out it swallows the next click — which
    // is exactly how a valid form ends up looking like a submit that did nothing. Wait for
    // the field to take the value and for the calendar to leave the DOM.
    await expect(this.unsetFields(scope)).toHaveCount(0, { timeout: 15000 });
    await expect(this.popover()).toHaveCount(0, { timeout: 15000 });
  }
}

module.exports = { CalendarPicker };    