/**
 * What a downloaded document is called.
 *
 * One scheme for every document, so a folder of them sorts into something a
 * person can work with: company, then document type, then the party, then what
 * identifies that particular document.
 *
 *   LUMA-TEXTILE_Bill_CUS-0001_110_2026-07-30.pdf
 *   LUMA-TEXTILE_Statement-of-Account_CUS-0001_2026-07-01_to_2026-07-31.pdf
 *
 * Underscores separate the fields and hyphens live inside them, so a field is
 * never mistaken for two. The company comes first because the party receiving
 * it files documents from several suppliers in one place.
 */

/** Anything that is not a letter, digit or hyphen becomes a hyphen. */
export function slug(value: string): string {
  return value
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function documentFileName(parts: {
  company: string;
  documentType: string;
  /** The party code, or its name when no code has been set. */
  party: string;
  /** Bill number, period, or whatever identifies this one document. */
  identifiers: string[];
}): string {
  const fields = [
    slug(parts.company),
    slug(parts.documentType),
    slug(parts.party),
    ...parts.identifiers.map(slug).filter(Boolean),
  ].filter(Boolean);
  return `${fields.join('_')}.pdf`;
}
