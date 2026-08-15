import { IBM_Plex_Sans } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * One face, self hosted.
 *
 * next/font fetches it at build time and serves it from this origin, so nothing
 * is requested from a font CDN when a screen opens. That matters in a Dhaka
 * office on a bad line, and it is the same reason the PDF path bundles its own
 * copy in assets/fonts rather than looking one up.
 *
 * IBM Plex Sans is what src/lib/pdf prints with, so a bill on screen and the
 * same bill on paper are set in one face down to the figures. There is
 * deliberately no monospace companion: alignment down a column is what
 * `font-variant-numeric: tabular-nums` does, Plex Sans carries tabular figures,
 * and a second family for figures alone would be the one thing on the screen
 * that the printed document could not match.
 */
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
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
