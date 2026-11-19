import type { ExpenseOrderOption } from '@/components/ExpenseForm';
import { listOrderLineOptions } from '@/lib/queries';

/**
 * Every Sales Order as the expense form offers it (2026-10-06): the whole
 * order, for freight or a lab test that covers all of it, or one of its lines,
 * for a transport trip that carried one fabric. The form keeps the open ones
 * and whatever the expense is already filed against.
 */
export async function expenseOrderOptions(): Promise<ExpenseOrderOption[]> {
  const lines = await listOrderLineOptions();
  const byOrder = new Map<string, ExpenseOrderOption>();
  for (const line of lines) {
    const order = byOrder.get(line.orderId) ?? {
      orderId: line.orderId,
      label: [line.orderDocNo, line.partyName, line.customerRef]
        .filter(Boolean)
        .join(', '),
      open: line.orderStatus === 'open',
      lines: [],
    };
    order.lines.push({
      id: line.id,
      label: [`Line ${line.lineNo}`, line.description, line.color]
        .filter(Boolean)
        .join(', '),
    });
    byOrder.set(line.orderId, order);
  }
  return [...byOrder.values()];
}
