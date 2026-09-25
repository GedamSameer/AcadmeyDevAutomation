# End-to-end suite — layout

```
tests/
  end-to-end.spec.js        the only spec: 3 serial tests, one per role
  flows/
    onboarding.flow.js      phase 1 — bulk-onboard N trainees, create the batch
    trainer.flow.js         phase 2 — add one trainee by hand, start the batch
    trainee.flow.js         phase 3 — first login, join the batch, work through Day 1
  pages/
    BasePage.js             sidebar nav + walkthrough dismissal (every screen)
    CalendarPicker.js       the date-picker popover
    LoginPage.js            staff login, trainee first login + forced password reset
    OnboardingPage.js       the bulk-onboarding wizard
    BatchManagementPage.js  the two-pane batch list / batch detail screen
    AddTraineeDialog.js     the "Add a trainee to <batch>" form
    TrainingPage.js         join gate, slide decks, the Day 1 stepper
  support/
    config.js               URLs, users, dropdown labels, caps, timeouts, paths
    naming.js               dropdown label -> batch name
    dates.js                pure date helpers
    data.js                 faker factories + the bulk CSV writer
    state.js                the `flow` handoff object, last-run.json, credentials.txt
    session.js              one fresh browser context per phase
```

## Rules of thumb

- **Locators live in page objects, never in flows or the spec.** If a selector changes,
  exactly one file changes.
- **Flows read like the manual test script** — they call page-object methods and assert
  outcomes, nothing else.
- **The spec only wires phases together**: timeouts, serial ordering, context lifetime.
- `support/config.js` is the only place with environment-specific values.

## Running

Needs a `.env` first — see the root [README](../README.md).

```bash
# the whole chain
npx playwright test tests/end-to-end.spec.js --project=chromium --headed

# one phase on its own — env vars stand in for the previous phase's output
BATCH_NAME="Example Partner Example City Offline 85" BATCH_CODE=2REX9J \
  npx playwright test -g "trainer adds"

TRAINEE_EMAIL=... TRAINEE_PASSWORD=... BATCH_CODE=2REX9J \
  npx playwright test -g "new trainee logs in"
```

Each phase writes what the next one needs to `tests/test-data/last-run.json`, and a
working trainee login is appended to `credentials.txt` at the project root.