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
    this.enterWorkspace = page.getByRole('button', { name: 'Traya' });
    this.skipForNow = page.locator("//button[normalize-space()='Skip for now']");
    this.setPassword = page.getByRole('button', { name: 'Set password & continue' });
    this.newPassword = page.getByRole('textbox', { name: 'New password', exact: true });
    this.confirmPassword = page.getByRole('textbox', { name: 'Confirm new password' });
    this.passwordTaken = page.getByText(/already in use by another user/i);
    // The wording has been both "Invalid credentials" and "Invalid email or password."
    this.invalidCredentials = page.getByText(/invalid (credentials|email or password)/i).first();
    this.otpDigits = page.getByRole('textbox', { name: /^Digit \d of verification code$/ });
    // Shown instead of the workspace when the account has no access to the tile clicked.
    this.notYourSpace = page.getByText(/this space isn['’]?t yours/i).first();
  }

  /**
   * Email + password, then the OTP step. The dev env pre-fills the code.
   *
   * The login API intermittently answers "Invalid credentials" for a correct password,
   * and a first click can be swallowed while the form is settling — so Send code is
   * clicked again straight away, up to LIMITS.MAX_LOGIN_CLICKS times, until the OTP lands.
   */
  async submitCredentials({ email, password }) {
    const filledDigits = () =>
      this.otpDigits.evaluateAll((els) => els.filter((el) => el.value.trim()).length);

    await this.gotoRoot();
    await this.email.fill(email);
    await this.password.fill(password);

    let outcome = null;
    for (let attempt = 1; attempt <= LIMITS.MAX_LOGIN_CLICKS; attempt++) {
      // A request that never answered leaves the form disabled with a nameless spinner in
      // place of Send code, so clicking again would just wait on the stuck request. Start
      // over on a fresh page instead.
      if (outcome === 'no response') {
        await this.gotoRoot();
        await this.email.fill(email);
        await this.password.fill(password);
      }

      // The error can clear the fields; only refill what's gone, no reload.
      if (!(await this.email.inputValue())) await this.email.fill(email);
      if (!(await this.password.inputValue())) await this.password.fill(password);

      const staleError = await this.invalidCredentials.isVisible();
      await this.sendCode.click();
      // Don't let the previous attempt's "Invalid credentials" count as this one's answer.
      if (staleError) {
        await this.invalidCredentials
          .waitFor({ state: 'hidden', timeout: TIMEOUTS.DIALOG })
          .catch(() => {});
      }

      // Whichever lands first: the error, or all six digits on the verify screen.
      outcome = 'no response';
      await expect
        .poll(async () => {
          if ((await filledDigits().catch(() => 0)) === 6) {
            outcome = 'otp';
          } else if (await this.invalidCredentials.isVisible().catch(() => false)) {
            outcome = 'invalid credentials';
          }
          return outcome;
        }, { timeout: TIMEOUTS.BRANCH })
        .toMatch(/^(otp|invalid credentials)$/)
        .catch(() => {});

      if (outcome === 'otp') break;

      expect(attempt, `login for ${email} still failing (${outcome}) after ` +
        `${LIMITS.MAX_LOGIN_CLICKS} clicks on Send code`).toBeLessThan(LIMITS.MAX_LOGIN_CLICKS);
      console.log(`Login attempt ${attempt} for ${email}: ${outcome} — ${outcome === 'no response' ? 'reloading and retrying' : 'clicking Send code again'}`);
      // Back off a little more each time: hammering the endpoint earns a 429.
      await this.page.waitForTimeout(2000 * attempt);
    }

    await expect
      .poll(filledDigits, {
        timeout: TIMEOUTS.LIST,
        message: `OTP must appear before Verify for ${email}`,
      })
      .toBe(6);
    await this.verify.click();
  }

  /** Full staff login: credentials, workspace, walkthrough out of the way. */
  async login(user) {
    await this.submitCredentials(user);
    await this.skipPromptIfShown();
    await this.enterWorkspace.click();

    // Wait for whichever lands — the workspace or the access refusal — then fail on the refusal.
    const nav = this.page.getByRole('navigation');
    await expect(nav.or(this.notYourSpace).first()).toBeVisible({ timeout: TIMEOUTS.NAV });
    await expect(this.notYourSpace, `${user.email} was refused the workspace: "This space isn't yours"`)
      .toBeHidden();
    await expect(nav).toBeVisible({ timeout: TIMEOUTS.NAV });
    await this.dismissWalkthrough();
  }

  /**
   * After Verify, a "Skip for now" prompt can sit in front of the workspace picker. It
   * doesn't show on every login, so wait for whichever screen arrives first and only click
   * Skip when it is the one that did.
   */
  async skipPromptIfShown() {
    await expect(this.skipForNow.or(this.enterWorkspace).first())
      .toBeVisible({ timeout: TIMEOUTS.BRANCH });
    if (await this.skipForNow.isVisible()) {
      await this.skipForNow.click();
      await expect(this.skipForNow).toBeHidden({ timeout: TIMEOUTS.DIALOG });
    }
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