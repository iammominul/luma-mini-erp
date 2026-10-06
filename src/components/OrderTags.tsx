import { type OrderStage, orderStageLabel } from '@/lib/order-costing';
import { type OrderStatus, orderStatusLabel } from '@/lib/types';

/**
 * The small marks an order list carries: the stage an order has reached and,
 * when a person has closed or cancelled it, that. Plain bordered text in the
 * register's own ink, the way a Draft bill is marked. Color is kept for state
 * a reader must act on (CLAUDE.md section 4), and only a cancelled order is
 * that.
 */
const TAG =
  'inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium';

export function StageTag({ stage }: { stage: OrderStage }) {
  const tone =
    stage === 'cancelled'
      ? 'border-red-200 text-red-700'
      : stage === 'billed' || stage === 'closed'
        ? 'border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-muted)]'
        : 'border-[var(--color-line)] text-[var(--color-ink)]';
  return <span className={`${TAG} ${tone}`}>{orderStageLabel(stage)}</span>;
}

export function StatusTag({ status }: { status: OrderStatus }) {
  if (status === 'open') return null;
  const tone =
    status === 'cancelled'
      ? 'border-red-200 text-red-700'
      : 'border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-muted)]';
  return <span className={`${TAG} ${tone}`}>{orderStatusLabel(status)}</span>;
}
