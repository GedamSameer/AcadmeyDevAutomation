// tests/pages/LoginPage.js
//
// The sign-in screen, for both staff (email + password + OTP) and a trainee on their very
// first login (temp password -> forced password reset).

const { expect } = require('@playwright/test');

const { TRAINEE_TEMP_PASSWORD, LIMITS, TIMEOUTS } = require('../support/config');
const { makeTraineePassword } = require('../support/data');
const { BasePage } = require('./BasePage');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.email = page.getByRole('textbox', { name: 'Email' });
    this.password = page.getByRole('textbox', { name: 'Password' });
    this.sendCode = page.getByRole('button', { name: 'Send code' });
    this.verify = page.getByRole('button', { name: 'Verify' });
    this.enterWorkspace = page.getByRole('button', { name: 'T Traya Enter workspace' });
    this.setPassword = page.getByRole('button', { name: 'Set password & continue' });
    this.newPassword = page.getByRole('textbox', { name: 'New password', exact: true });
    this.confirmPassword = page.getByRole('textbox', { name: 'Confirm new password' });
    this.passwordTaken = page.getByText(/already in use by another user/i);
    this.otpDigits = page.getByRole('textbox', { name: /^Digit \d of verification code$/ });
  }

  /** Email + password, then the OTP step. The dev env pre-fills the code. */
  async submitCredentials({ email, password }) {
    await this.gotoRoot();
    await this.email.fill(email);
    await this.password.fill(password);
    await this.sendCode.click();
    // dev env pre-fills the OTP — put the real code entry here if that ever changes
    await this.verify.click();
  }

  /** Full staff login: credentials, workspace, walkthrough out of the way. */
  async login(user) {
    await this.submitCredentials(user);
    await this.enterWorkspace.click();
    await expect(this.page.getByRole('navigation')).toBeVisible({ timeout: TIMEOUTS.NAV });
    await this.dismissWalkthrough();
  }

  /**
   * First-time trainee login: temp password, OTP, then the forced password reset.
   * Returns the password that ended up in effect, so a re-run against the same account
   * can skip the reset. `onPasswordSet` fires the moment the platform accepts one, so the
   * credential is persisted even if a later step blows up.
   */
  async loginAsTrainee(trainee, { onPasswordSet } = {}) {
    await this.submitCredentials({
      email: trainee.email,
      password: trainee.password || TRAINEE_TEMP_PASSWORD,
    });

    // After Verify the app lands on one of two screens: the forced password reset (first
    // login ever) or the workspace picker. Wait for whichever arrives before branching —
    // locator.isVisible() ignores its timeout option and answers about *this instant*, so
    // on its own it just races the render and always takes the wrong branch.
    await expect(this.setPassword.or(this.enterWorkspace).first())
      .toBeVisible({ timeout: TIMEOUTS.BRANCH });

    if (await this.setPassword.isVisible()) {
      // Assign before the callback fires: the caller persists `flow`, which holds this
      // very object, so the password has to be on it by then or last-run.json saves null.
      await this.resetPassword(async (candidate) => {
        trainee.password = candidate;
        if (onPasswordSet) await onPasswordSet(candidate);
      });
    }

    await this.enterWorkspace.click();
    return trainee.password;
  }

  /**
   * The forced password-reset screen. The platform rejects any password another user
   * already holds, so this keeps generating until one sticks.
   */
  async resetPassword(onPasswordSet) {
    // This screen carries its own OTP, which the dev env fills in a beat after the form
    // mounts — and that render clears anything already typed into the password fields.
    // Type after the six digits have landed, not before.
    await expect
      .poll(() => this.otpDigits.evaluateAll((els) => els.filter((el) => el.value.trim()).length), {
        timeout: 30000,
        message: 'auto-filled OTP on the password-reset screen',
      })
      .toBe(6);

    for (let attempt = 1; ; attempt++) {
      const candidate = makeTraineePassword();
      await this.newPassword.fill(candidate);
      await this.confirmPassword.fill(candidate);

      await expect(this.setPassword, 'password reset form accepted the new password')
        .toBeEnabled({ timeout: TIMEOUTS.DIALOG });
      await this.setPassword.click();

      // Either the screen goes away, or it comes back complaining the password is taken.
      const accepted = await this.setPassword
        .waitFor({ state: 'hidden', timeout: TIMEOUTS.LIST })
        .then(() => true)
        .catch(() => false);

      if (accepted) {
        if (onPasswordSet) await onPasswordSet(candidate);
        return candidate;
      }

      const collision = await this.passwordTaken.isVisible();
      expect(collision, `password reset stalled on attempt ${attempt}`).toBe(true);
      expect(attempt, 'attempts at an unused password').toBeLessThan(LIMITS.MAX_PASSWORD_ATTEMPTS);
    }
  }
}

module.exports = { LoginPage };