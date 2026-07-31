import { company } from '@/lib/env';
import { renderPdf } from '@/lib/pdf/render';
import {
  buildStatementDocument,
  statementFileName,
} from '@/lib/pdf/statement-document';
import { earliestActivity, findParty, listMovements } from '@/lib/queries';
import { isSide } from '@/lib/side';
import { buildStatement } from '@/lib/statement';

/** The Party Ledger as a real A4 PDF, downloaded. */
export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value: string | null): string | null =>
  value && DATE_PATTERN.test(value) ? value : null;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ side: string; partyId: string }> },
) {
  const { side, partyId } = await params;
  if (!isSide(side)) return new Response('Not found', { status: 404 });

  const party = await findParty(partyId);
  if (!party || !party.roles[isSide(side) ? side : 'customer']) {
    return new Response('Not found', { status: 404 });
  }

  // The same period the screen was showing, so the download matches what was
  // on screen when the button was pressed.
  const url = new URL(request.url);
  const from = clean(url.searchParams.get('from'));
  const to = clean(url.searchParams.get('to'));

  const [movements, coversFrom] = await Promise.all([
    listMovements(party.id),
    earliestActivity(party.id),
  ]);

  const statement = buildStatement({
    openingBalance: party.openingBalance,
    movements,
    from,
    to,
  });

  const pdf = await renderPdf(
    buildStatementDocument({
      party,
      statement,
      company: company(),
      from,
      to,
      coversFrom,
      lens: side,
    }),
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${statementFileName(party, company(), from, to)}"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
