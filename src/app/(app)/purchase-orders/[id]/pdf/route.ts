import { company } from '@/lib/env';
import {
  buildOrderDocDocument,
  orderDocFileName,
} from '@/lib/pdf/order-doc-document';
import { renderPdf } from '@/lib/pdf/render';
import { findPurchaseOrder, getParty, listOrderLineOptions } from '@/lib/queries';
import { requirePermission } from '@/lib/session';

/** The Purchase Order as a real A4 PDF, downloaded, named by its number. */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission('bill:read');
  const { id } = await params;
  const doc = await findPurchaseOrder(id);
  if (!doc) return new Response('Not found', { status: 404 });
  const party = await getParty(doc.partyId);
  if (!party) return new Response('Not found', { status: 404 });

  const customerRefs = new Map(
    (await listOrderLineOptions()).map((line) => [line.orderDocNo, line.customerRef]),
  );
  const pdf = await renderPdf(
    buildOrderDocDocument({ doc, kind: 'po', party, customerRefs, company: company() }),
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${orderDocFileName(doc)}"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
