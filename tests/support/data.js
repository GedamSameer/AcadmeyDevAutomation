// tests/support/data.js
//
// Test-data factories and the bulk CSV writer.

const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

const { PASSWORD_YEARS, LANGUAGES, CSV_HEADERS } = require('./config');
const { ddmmyyyy } = require('./dates');

/**
 * True for a year whose digits run in order, up or down, anywhere in it: 1789 (7-8-9),
 * 1987 (9-8-7), 1234, 3210. Three in a row is enough to call it a pattern.
 */
const hasDigitRun = (year) => {
  const d = String(year).split('').map(Number);
  return d.some((_, i) => {
    if (i < 2) return false;
    const up = d[i] === d[i - 1] + 1 && d[i - 1] === d[i - 2] + 1;
    const down = d[i] === d[i - 1] - 1 && d[i - 1] === d[i - 2] - 1;
    return up || down;
  });
};

/**
 * The password a trainee sets on first login: a random first name, @, and a year —
 * "Aurelio@1995". It has to be generated, not hardcoded: the platform refuses a password
 * any other user already has ("This password is already in use by another user"), so a
 * fixed one works exactly once and then fails forever.
 */
function makeTraineePassword() {
  const name = faker.person.firstName().replace(/[^A-Za-z]/g, '');
  let year;
  do {
    year = faker.number.int(PASSWORD_YEARS);
  } while (hasDigitRun(year));
  return `${name}@${year}`;
}

/** A row for the bulk CSV. */
function makeCsvTrainee() {
  const sex = faker.helpers.arrayElement(['male', 'female']);
  return {
    // first + last only — no titles or suffixes, "as per Govt ID"
    name: `${faker.person.firstName(sex)} ${faker.person.lastName()}`,
    phone: `9${faker.string.numeric(9)}`,
    role: 'Trainee',
    type: '',
    languages: faker.helpers.arrayElements(LANGUAGES, { min: 1, max: 2 }).join(', '),
    employeeId: `${faker.string.alpha({ length: 4, casing: 'upper' })}${faker.string.numeric(6)}`,
    gender: sex === 'male' ? 'Male' : 'Female',
    versantScore: faker.number.int({ min: 4, max: 9 }),
    versantTin: faker.string.numeric(6),
    dob: ddmmyyyy(faker.date.birthdate({ min: 21, max: 45, mode: 'age' })),
  };
}

/** The single trainee the trainer adds through the form. */
function makeFormTrainee() {
  const sex = faker.helpers.arrayElement(['male', 'female']);
  return {
    fullName: `${faker.person.firstName(sex)} ${faker.person.lastName()}`,
    phone: `9${faker.string.numeric(9)}`,
    employeeId: `TRA${faker.string.numeric(6)}`,
    gender: sex === 'male' ? 'Male' : 'Female',
    versantScore: String(faker.number.int({ min: 4, max: 9 })),
    versantTin: faker.string.numeric(6),
    dob: faker.date.birthdate({ min: 21, max: 45, mode: 'age' }),
    email: null,    // minted by the platform — scraped off the batch table after onboarding
    password: null, // set on first login in the trainee phase
  };
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);

function writeBulkCsv(filePath, count) {
  const rows = Array.from({ length: count }, makeCsvTrainee).map((t) =>
    [t.name, t.phone, t.role, t.type, t.languages, t.employeeId,
     t.gender, t.versantScore, t.versantTin, t.dob].map(csvCell).join(',')
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [CSV_HEADERS.join(','), ...rows].join('\n') + '\n');
  return filePath;
}

module.exports = {
  hasDigitRun,
  makeTraineePassword,
  makeCsvTrainee,
  makeFormTrainee,
  writeBulkCsv,
};