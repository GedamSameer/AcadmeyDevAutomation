// tests/support/session.js
//
// Each phase gets its own browser context, so the three roles never share a session
// (no logout steps needed). This wrapper guarantees the context is closed even when the
// phase throws — the original spec leaked a context on every failure.

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {(page: import('@playwright/test').Page) => Promise<T>} run
 * @returns {Promise<T>}
 * @template T
 */
async function withFreshContext(browser, run) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return await run(page);
  } finally {
    await context.close();
  }
}

module.exports = { withFreshContext };