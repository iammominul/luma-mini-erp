import type { BillLinkOption } from '@/components/BillForm';
import { formatQtyKg, formatRate, parseQtyKg } from '@/lib/amount';
import { listOrderLineOptions, listSourceLineOptions } from '@/lib/queries';
import type { PartyRole } from '@/lib/types';

/**
 * What a bill line on this lens can be tied to (2026-10-06): a customer bill
 * to a Sales Order line, a supplier's bill to a PO line, a subcontractor's to
 * a WO line. Every party's, with the order's status: the form narrows them to
 * the bill's party and to open orders, and keeps whatever a line already has.
 */
export async function billLinkOptions(role: PartyRole): Promise<BillLinkOption[]> {
  if (role === 'customer') {
    const lines = await listOrderLineOptions();
    return lines.map((line) => ({
      id: line.id,
      partyId: line.partyId,
      label: [
        `${line.orderDocNo} / ${line.lineNo}`,
        line.customerRef,
        line.description,
        line.color,
      ]
        .filter(Boolean)
        .join(', '),
      open: line.orderStatus === 'open',
      description: line.description,
      color: line.color,
      quantityKg: null,
      rate: null,
    }));
  }
  const lines = await listSourceLineOptions(role === 'supplier' ? 'po' : 'wo');
  return lines.map((line) => ({
    id: line.id,
    partyId: line.partyId,
    label: [
      `${line.docNo} / ${line.lineNo}`,
      line.customerRef ?? line.orderDocNo,
      line.description,
      line.color,
    ]
      .filter(Boolean)
      .join(', '),
    open: line.status === 'open',
    description: line.description,
    color: line.color,
    // What was ordered, offered as what is billed until somebody types the
    // figure off the party's own bill.
    quantityKg: formatQtyKg(parseQtyKg(line.quantityKg)).replace(/,/g, ''),
    rate: formatRate(line.rate),
  }));
}
