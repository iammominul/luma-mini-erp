import { createRequire } from 'node:module';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { fonts } from './fonts';

/**
 * Turns a pdfmake definition into PDF bytes. This is the one place a PDF is
 * produced: the document builders make the definition, this makes the file. The
 * same split the full ERP uses, so a builder moves across unchanged.
 *
 * These are real PDFs, downloaded, never the browser's print of a screen. A
 * printed screen carries the browser's own headers, margins and page breaks,
 * which is not something to hand a customer.
 */

// @types/pdfmake covers only the browser createPdf API. The server-side
// PdfPrinter is a CommonJS constructor, so it is required and typed here.
interface PdfKitDocument {
  on(event: 'data', cb: (chunk: Buffer) => void): void;
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  end(): void;
}
interface PdfPrinter {
  new (fonts: TFontDictionary): {
    createPdfKitDocument(definition: TDocumentDefinitions): PdfKitDocument;
  };
}

type Printer = InstanceType<PdfPrinter>;

let printer: Printer | null = null;

/**
 * Built on first use, not at module load. `next build` imports every module to
 * collect page data, and constructing the printer then would put font loading
 * on the build's critical path for no reason.
 */
function getPrinter(): Printer {
  if (!printer) {
    const require = createRequire(import.meta.url);
    const PdfPrinter = require('pdfmake') as PdfPrinter;
    printer = new PdfPrinter(fonts);
  }
  return printer;
}

export function renderPdf(definition: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = getPrinter().createPdfKitDocument(definition);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
