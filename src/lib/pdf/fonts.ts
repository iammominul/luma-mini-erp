import { join } from 'node:path';
import type { TFontDictionary } from 'pdfmake/interfaces';

/**
 * IBM Plex Sans (SIL OFL 1.1), bundled in assets/fonts. It is a corporate text
 * face with tabular figures, which is what a column of money needs, and it sets
 * a document a shade more formally than a UI face does.
 *
 * The files are .woff rather than .ttf. pdfkit reads fonts through fontkit,
 * which handles WOFF natively, and the WOFF build is a fifth of the size of the
 * TrueType one for the same four faces. The only package shipping IBM Plex as
 * TrueType is 186 MB, which is not a sane dependency for four faces.
 *
 * Bold is SemiBold (600) rather than Bold (700): at 8 to 10pt on a ruled table,
 * 700 goes muddy where 600 stays crisp.
 *
 * The path is resolved from the working directory, which is the project root
 * locally and the function root on Vercel. next.config.ts names these files in
 * outputFileTracingIncludes so they are deployed alongside the route that reads
 * them; without that they are absent at runtime and every render fails.
 */
const FONT_DIR =
  process.env.PDF_FONT_DIR ??
  join(process.cwd(), 'assets', 'fonts', 'IBMPlexSans');

export const DOCUMENT_FONT = 'IBMPlexSans';

export const fonts: TFontDictionary = {
  [DOCUMENT_FONT]: {
    normal: join(FONT_DIR, 'IBMPlexSans-Regular.woff'),
    bold: join(FONT_DIR, 'IBMPlexSans-SemiBold.woff'),
    italics: join(FONT_DIR, 'IBMPlexSans-Italic.woff'),
    bolditalics: join(FONT_DIR, 'IBMPlexSans-SemiBoldItalic.woff'),
  },
};
