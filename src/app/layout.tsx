import localFont from 'next/font/local';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * One face, self hosted, and the files are in the repository.
 *
 * This was `next/font/google`, which serves the face from this origin but
 * downloads it from Google while building. That fetch is a build time
 * dependency on somebody else's CDN, and on 2026-08-15 it started failing on
 * Vercel's builders: the stylesheet came back from fonts.googleapis.com and the
 * face itself did not come back from fonts.gstatic.com, so Turbopack could not
 * resolve the font file and the build stopped. The same commit built in fifteen
 * seconds on a laptop with a cold cache. A deploy that cannot be made because a
 * third party is unreachable is a deploy that cannot be made in an emergency
 * either, which is the argument for holding the files here.
 *
 * They are the Latin subset, which is all this app sets: money is written "Tk"
 * and never the Taka sign, for the reason given in format.ts.
 *
 * These three are the screen's. assets/fonts/IBMPlexSans is the PDF's and is
 * read off disk at render time rather than imported, so the two are not one set
 * of files, but they are one typeface: a bill on screen and the same bill on
 * paper are set in IBM Plex Sans down to the figures. There is deliberately no
 * monospace companion: alignment down a column is what
 * `font-variant-numeric: tabular-nums` does, Plex Sans carries tabular figures,
 * and a second family for figures alone would be the one thing on the screen
 * that the printed document could not match.
 *
 * Weight 500 is here because 93 places ask for it. With only 400 and 600
 * declared, CSS weight matching sends every one of them down to 400 and every
 * label, button and column heading in the app renders a step lighter.
 */
const sans = localFont({
  src: [
    { path: './fonts/IBMPlexSans-Regular.woff', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexSans-Medium.woff', weight: '500', style: 'normal' },
    {
      path: './fonts/IBMPlexSans-SemiBold.woff',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-plex-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Interim Billing',
  description: 'Customer and subcontractor billing, receipts, and statements.',
};

// Next sends this by default. It is written out so it is a decision on the
// record: no maximum-scale and no user-scalable false, because a clerk reading
// a figure off a phone has to be able to pinch it larger.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
