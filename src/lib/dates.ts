/**
 * Dates are 'YYYY-MM-DD' text from end to end: no Date object crosses the
 * database boundary, so nothing can shift a bill by a day. "Today" is today in
 * Asia/Dhaka, not on whichever server ran the request.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function todayInDhaka(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** '2026-07-30' becomes '30 Jul 2026'. Unparseable input is returned as is. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  const name = MONTHS[Number(month) - 1];
  if (!year || !month || !day || !name) return iso;
  return `${day} ${name} ${year}`;
}

/** First day of the month containing the given date. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
