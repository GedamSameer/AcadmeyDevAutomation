// tests/support/dates.js
//
// Pure date helpers. Anything that touches the calendar widget lives in
// pages/CalendarPicker.js instead.

/** Local midnight today, offset by N days. */
function dayOffset(days = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

const today = () => dayOffset(0);
const tomorrow = () => dayOffset(1);

/** `date` + n days, at local midnight. */
function addDays(date, n) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/** "21-09-2026" — for CSV cells. */
const ddmmyyyy = (d) =>
  [d.getDate(), d.getMonth() + 1].map((n) => String(n).padStart(2, '0')).join('-') +
  `-${d.getFullYear()}`;

/** Matches a day button, with or without the picker's "Today, " / "Tomorrow, " prefix. */
function dayLabel(d) {
  const weekday = d.toLocaleString('en-US', { weekday: 'long' });
  const month = d.toLocaleString('en-US', { month: 'long' });
  const n = d.getDate();
  const suffix =
    n % 10 === 1 && n !== 11 ? 'st' :
    n % 10 === 2 && n !== 12 ? 'nd' :
    n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return new RegExp(`^(?:Today, |Tomorrow, )?${weekday}, ${month} ${n}${suffix}`);
}

module.exports = { dayOffset, today, tomorrow, addDays, ddmmyyyy, dayLabel };