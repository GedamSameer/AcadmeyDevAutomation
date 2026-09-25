# Academy E2E — Playwright suite

End-to-end coverage of the three role journeys through the training platform, run as one
chain so each phase consumes what the last one produced:

1. **Onboarding specialist** bulk-onboards N outsource trainees from a generated sheet,
   which creates a batch.
2. **Trainer** opens that batch, adds one more trainee through the form, and starts it.
3. **Trainee** does a first-time login (temp password → forced reset), joins the batch
   with its code, and works through Day 1 until a test is available.

Built with the Page Object Model — see [`tests/README.md`](tests/README.md) for the file
layout and the conventions.

## Setup

```bash
npm install
npx playwright install chromium

cp .env.example .env
# then fill in .env — see the comments in .env.example
```

Every environment- and org-specific value (URL, logins, partner and location labels) is
read from the environment. Nothing identifying is committed, and `tests/support/config.js`
fails fast with the variable's name if one is missing.

## Running

```bash
# the whole chain
npx playwright test tests/end-to-end.spec.js --project=chromium --headed

# one phase on its own — env vars stand in for the previous phase's output
BATCH_NAME="Example Partner Example City Offline 85" BATCH_CODE=2REX9J \
  npx playwright test -g "trainer adds"
```

## Files a run produces — all gitignored

| Path | What's in it |
| --- | --- |
| `tests/test-data/bulk.csv` | The generated onboarding sheet for the current run |
| `tests/test-data/last-run.json` | The phase handoff: batch name, join code, trainee login |
| `credentials.txt` | Every working trainee login the suite has created |

`last-run.json` and `credentials.txt` hold real, working credentials for the target
environment. They are in `.gitignore` for that reason — don't force-add them.

## Notes

- The three phases run **serially**: a failure skips the phases that depended on its output
  rather than failing them noisily.
- Each phase gets its own browser context, so the roles never share a session.
- The suite stops at "Start test" rather than sitting the test itself.