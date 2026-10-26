// tests/support/buddyup.state.js
//
// The Buddy Up run's handoff, kept apart from state.js so it never clobbers the Traya
// last-run.json. Env vars win, same as there:
//
//   BUDDY_BATCH_NAME="DrITM Mohali Offline 848" BUDDY_TRAINEE_EMAIL=... BUDDY_TRAINEE_PASSWORD=... \
//     npx playwright test tests/buddy-up.spec.js -g "QA"

const fs = require('fs');
const path = require('path');

const { BUDDY_PATHS } = require('./buddyup.config');

const buddyFlow = {
  batchNo: null,
  batchName: process.env.BUDDY_BATCH_NAME || null,
  batchCode: process.env.BUDDY_BATCH_CODE || null,
  bulkTrainees: [],    // [{ name, role }] from the onboarding CSV
  staffSupport: null,  // the Staff Support row the trainer turns into a Trainee
  formTrainee: null,   // added through the New trainee tab
  csvTrainees: [],     // added through the Upload CSV tab
  trainee: process.env.BUDDY_TRAINEE_EMAIL
    ? {
        email: process.env.BUDDY_TRAINEE_EMAIL,
        password: process.env.BUDDY_TRAINEE_PASSWORD || null,
        fullName: process.env.BUDDY_TRAINEE_NAME || '(from env)',
      }
    : null,
  cmsModule: null,
};

// BUDDY_RESUME=1 picks up where the last run left off — batch, roster, passwords — so the
// later phases can be re-run on their own: BUDDY_RESUME=1 npx playwright test ... -g "QA"
if (process.env.BUDDY_RESUME && fs.existsSync(BUDDY_PATHS.RUN_FILE)) {
  Object.assign(buddyFlow, JSON.parse(fs.readFileSync(BUDDY_PATHS.RUN_FILE, 'utf8')));
}

function saveBuddyRun() {
  fs.mkdirSync(path.dirname(BUDDY_PATHS.RUN_FILE), { recursive: true });
  fs.writeFileSync(BUDDY_PATHS.RUN_FILE, JSON.stringify(buddyFlow, null, 2));
}

module.exports = { buddyFlow, saveBuddyRun };
