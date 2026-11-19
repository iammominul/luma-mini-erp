import { company } from '@/lib/env';
import { billFileName, buildBillDocument } from '@/lib/pdf/bill-document';
import { renderPdf } from '@/lib/pdf/render';
import { findBill } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';

/** The bill as a real A4 PDF, downloaded. Rendered fresh, never cached. */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ side: string; id: string }> },
) {
  const { side, id } = await params;
  if (!isSide(side)) return new Response('Not found', { status: 404 });

  const bill = await findBill(id);
  if (!bill || bill.partyRole !== copyFor(side).role) {
    return new Response('Not found', { status: 404 });
  }

  const pdf = await renderPdf(buildBillDocument(bill, company()));

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${billFileName(bill)}"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
