// tests/pages/StarfleetPage.js
//
// Starfleet admin: the external-employee sign-in (email + password + OTP) and the
// User -> User List entry in the sidebar.

const { expect } = require('@playwright/test');

const { TIMEOUTS } = require('../support/config');
const { STARFLEET_URL } = require('../support/mool.config');

class StarfleetPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.email = page.getByRole('textbox', { name: 'Email address' });
    this.password = page.getByRole('textbox', { name: 'Password' });
    this.signIn = page.getByRole('button', { name: 'Sign in' });
    this.verify = page.getByRole('button', { name: 'Verify' });
    this.otpDigits = page.getByRole('textbox', { name: '•' });

    this.userMenu = page.locator("//div[@aria-label='User']");
    this.userListLink = page.getByRole('link', { name: 'User List', exact: true });
    this.usersTable = page.getByRole('table', { name: 'sticky table' });
    this.newUser = page.getByRole('button', { name: 'New user' });
  }

  /** The root page is Google SSO only; staff logins go through the external form. */
  async gotoSignIn() {
    await this.page.goto(new URL('/auth/jwt/sign-in-external?returnTo=%2Fdashboard', STARFLEET_URL).href);
  }

  async login({ email, password }) {
    await this.gotoSignIn();
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signIn.click();

    // dev env auto-fills the OTP — wait for all six digits before verifying
    await expect
      .poll(() => this.otpDigits.evaluateAll((els) => els.filter((el) => el.value.trim()).length), {
        timeout: TIMEOUTS.LIST,
        message: 'auto-filled OTP on the Starfleet verify screen',
      })
      .toBe(6);
    await this.verify.click();

    await this.page.waitForURL((url) => url.pathname.startsWith('/dashboard'), {
      timeout: TIMEOUTS.NAV,
    });
  }

  /** User List only renders once the User item in the sidebar is hovered. */
  async openUserList() {
    await expect(this.userMenu).toBeVisible({ timeout: TIMEOUTS.NAV });
    await this.userMenu.hover();
    await expect(this.userListLink).toBeVisible({ timeout: TIMEOUTS.DIALOG });
    await this.userListLink.click();

    await this.page.waitForURL(/\/dashboard\/user\/list/, { timeout: TIMEOUTS.NAV });
    await expect(this.usersTable).toBeVisible({ timeout: TIMEOUTS.LIST });
  }
}

module.exports = { StarfleetPage };
