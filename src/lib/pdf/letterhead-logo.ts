import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The letterhead logo, read from disk once per process.
 *
 * It is a file rather than something in the source for the same reason the
 * company name is an environment variable: this app is not LUMA specific.
 * Dropping a different assets/letterhead-logo.svg puts another company on every
 * document, and if the file is missing the letterhead falls back to the company
 * name set as text, so a document still prints.
 *
 * pdfmake renders a string SVG with useCSS false, so the file must carry its
 * fills on the elements and must not rely on a font. assets/letterhead-logo.svg
 * says more about that.
 */

const LOGO_PATH =
  process.env.PDF_LOGO_PATH ??
  join(process.cwd(), 'assets', 'letterhead-logo.svg');

/** undefined means not looked for yet; null means looked for and not there. */
let cached: string | null | undefined;

export function letterheadLogo(): string | null {
  if (cached === undefined) {
    try {
      cached = readFileSync(LOGO_PATH, 'utf8');
    } catch {
      cached = null;
    }
  }
  return cached;
}
