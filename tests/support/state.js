// tests/support/state.js
//
// The handoff between phases. Env vars win, so any phase can be re-run on its own:
//
//   BATCH_NAME="Example Partner Example City Offline 85" BATCH_CODE=2REX9J \
//     npx playwright test -g "trainer adds"

const fs = require('fs');
const path = require('path');

const { PATHS } = require('./config');

/** State handed from one phase to the next. */
const flow = {
  batchNo: null,
  batchName: process.env.BATCH_NAME || null,
  batchCode: process.env.BATCH_CODE || null,
  trainee: process.env.TRAINEE_EMAIL
    ? {
        email: process.env.TRAINEE_EMAIL,
        password: process.env.TRAINEE_PASSWORD || null,
        fullName: '(from env)',
      }
    : null,
};

function saveRun() {
  fs.mkdirSync(path.dirname(PATHS.RUN_FILE), { recursive: true });
  fs.writeFileSync(PATHS.RUN_FILE, JSON.stringify(flow, null, 2));
}

/** Append one trainee's working login to credentials.txt — the file the older specs use. */
function saveCredentials({ batchName, batchCode, username, email, password }) {
  const line = [
    `Batch ID: ${batchCode || '?'}`,
    `Batch: ${batchName || '?'}`,
    `Username: ${username || '?'}`,
    `Email: ${email}`,
    `Password: ${password}`,
    `Set: ${new Date().toISOString()}`,
  ].join(' | ');

  fs.appendFileSync(PATHS.CREDENTIALS, `${line}\n`);
  console.log(`credentials.txt <- ${line}`);
}

module.exports = { flow, saveRun, saveCredentials };