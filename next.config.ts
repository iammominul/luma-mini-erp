import type { NextConfig } from 'next';

const config: NextConfig = {
  typedRoutes: false,

  // pdfmake reads its .ttf files from disk at render time, and pdfmake itself is
  // CommonJS loaded through createRequire. Neither is something the bundler can
  // trace on its own, so both are named here. Without the fonts entry, every PDF
  // route works locally and fails on Vercel with a missing font file.
  serverExternalPackages: ['pdfmake'],
  outputFileTracingIncludes: {
    '/**': [
      './assets/fonts/IBMPlexSans/*.woff',
      './assets/letterhead-logo.svg',
    ],
  },
};

export default config;
