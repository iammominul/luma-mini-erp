import { company } from '@/lib/env';
import {
  buildMoneyReceiptDocument,
  moneyReceiptFileName,
} from '@/lib/pdf/money-receipt-document';
import { renderPdf } from '@/lib/pdf/render';
import { findPayment, getParty } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';

/** The Money Receipt or Payment Voucher as a real A4 PDF, downloaded. */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ side: string; id: string }> },
) {
  const { side, id } = await params;
  if (!isSide(side)) return new Response('Not found', { status: 404 });

  const payment = await findPayment(id);
  if (!payment || payment.partyRole !== copyFor(side).role) {
    return new Response('Not found', { status: 404 });
  }

  const party = await getParty(payment.partyId);
  if (!party) return new Response('Not found', { status: 404 });

  const pdf = await renderPdf(
    buildMoneyReceiptDocument({ payment, party, company: company() }),
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${moneyReceiptFileName(payment, party)}"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
