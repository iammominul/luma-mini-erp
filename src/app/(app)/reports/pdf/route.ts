import { company } from '@/lib/env';
import {
  buildProfitStatementDocument,
  profitStatementFileName,
} from '@/lib/pdf/profit-statement-document';
import { renderPdf } from '@/lib/pdf/render';
import { statementFor } from '@/lib/profit';

/** The Profit Statement for a range, as a real A4 PDF, downloaded. */
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  // A range is what this document is, so a missing or malformed one is a wrong
  // address rather than an empty report.
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    return new Response('Not found', { status: 404 });
  }

  // The same assembly the screen uses, so the paper cannot disagree with it.
  const statement = await statementFor(from, to);
  const pdf = await renderPdf(
    buildProfitStatementDocument({
      statement,
      company: company(),
      from,
      to,
    }),
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${profitStatementFileName(from, to)}"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
