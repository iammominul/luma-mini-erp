/**
 * How a record is named in a URL.
 *
 * Two kinds of identifier exist here and they are not interchangeable. A row has
 * a UUID, which is what foreign keys point at and what never changes. A record a
 * person deals with also has a business key: `CUS-0001` for a party, `CB-26-0113`
 * for a customer bill. The business key is what goes in a URL, because a URL is
 * read aloud, pasted into an email and recognized on a screen, and a UUID is none
 * of those things.
 *
 * The UUID still resolves, so nothing bookmarked ever breaks. It redirects to the
 * business key rather than serving the page, so one record has one address.
 *
 * The guard matters as much as the scheme. Every id reaches Postgres through a
 * `::uuid` cast, and the cast throws on anything the wrong shape, which surfaces
 * as a server error rather than a missing page. A mistyped URL is a normal event
 * and must read as "not found".
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * A party code: two or more letters, a hyphen, then digits. `CUS-0001`, and
 * `SUP-0001` when there is a supplier to trade with. The digits widen past 9999
 * rather than being truncated, so the pattern does not cap their length.
 */
const PARTY_CODE_PATTERN = /^[A-Z]{2,4}-\d{3,}$/i;

export function isPartyCode(value: string): boolean {
  return PARTY_CODE_PATTERN.test(value);
}

/**
 * A system bill number: `CB-26-0113`. The middle pair is the fiscal year the
 * series belongs to, so a number stays unambiguous across years.
 */
const DOC_NO_PATTERN = /^[A-Z]{2,4}-\d{2,4}-\d{3,}$/i;

export function isDocNo(value: string): boolean {
  return DOC_NO_PATTERN.test(value);
}
