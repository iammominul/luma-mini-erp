/**
 * What a downloaded document is called (owner, 2026-10-06: short and concise).
 *
 * A numbered document is saved as its number and nothing else, because the
 * number already says what the document is, and the document itself names the
 * company and the party:
 *
 *   CB-26-0113.pdf      MR-26-0042.pdf      PV-26-0018.pdf
 *
 * A document with no number of its own gets a short description instead, in
 * hyphenated words, with the party's or person's name where it is about one:
 *
 *   Statement-Rongdhonu-Dyeing-2026-07-01-to-2026-09-30.pdf
 *   Payslip-2026-09-Abdul-Karim.pdf
 *
 * Never a party code, an employee code or a uuid. A code is the book's own key,
 * and a file goes to people outside the book.
 *
 * The trade-off is accepted on purpose: a party who saves CB-26-0113.pdf into a
 * folder of other suppliers' documents cannot tell who sent it until it is
 * opened.
 */

/** Anything that is not a letter, digit or hyphen becomes a hyphen. */
export function slug(value: string): string {
  return value
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** A numbered document: its number, exactly as printed on it. */
export function numberedFileName(docNo: string): string {
  return `${slug(docNo)}.pdf`;
}

/** A document with no number of its own: its words, hyphenated. */
export function describedFileName(parts: (string | null | undefined)[]): string {
  const fields = parts
    .filter((part): part is string => Boolean(part))
    .map(slug)
    .filter(Boolean);
  return `${fields.join('-')}.pdf`;
}
