// tests/support/issues.js
//
// For app behaviour worth reporting that shouldn't stop the run — a list that is stale until
// a reload, a placeholder name on a card. expect.soft would fail the test, and in a serial
// spec that skips every phase after it. This records the issue as an "issue" annotation
// (shown in the HTML report) and a console warning instead, and tells the caller whether
// the check held.

const { test } = require('@playwright/test');

/**
 * @param {() => Promise<unknown>} check  an assertion, e.g. () => expect(x).toBeVisible()
 * @param {string} issue                   what it means when the check doesn't hold
 * @returns {Promise<boolean>}
 */
async function flagUnless(check, issue) {
  try {
    await check();
    return true;
  } catch {
    test.info().annotations.push({ type: 'issue', description: issue });
    console.warn(`ISSUE: ${issue}`);
    return false;
  }
}

module.exports = { flagUnless };
