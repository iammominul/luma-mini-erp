/**
 * Dates are 'YYYY-MM-DD' text from end to end: no Date object crosses the
 * database boundary, so nothing can shift a bill by a day. "Today" is today in
 * Asia/Dhaka, not on whichever server ran the request.
 *
 * There is one display format, DD/MM/YYYY, and one function that produces it.
 * Two formats meant a document could show "06 Apr 2026" in one place and
 * "06/04/2026" in another, so the second one is gone rather than kept in step.
 */

export function todayInDhaka(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** '2026-07-31' becomes '31/07/2026'. Unparseable input is returned as is. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

/** First day of the month containing the given date. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * The fiscal year a date falls in, as the four digits a document number carries:
 * '2026-07-31' is in 2026-27, so '2627'.
 *
 * Bangladesh runs July to June, which is what the full ERP's document numbering
 * assumes too (`CB-2526-0001`, resetting each July). A date in January belongs to
 * the year that started the previous July.
 */
export function fiscalYearCode(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
}
