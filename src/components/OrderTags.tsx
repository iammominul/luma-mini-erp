import { Tag } from '@/components/ui';
import { type OrderStage, orderStageLabel } from '@/lib/order-costing';
import { type OrderStatus, orderStatusLabel } from '@/lib/types';

/**
 * The marks an order list carries: the stage an order has reached and, when a
 * person has closed or cancelled it, that. Drawn through the one `Tag`, so an
 * order's state reads the way a bill's or a payroll run's does.
 */
export function StageTag({ stage }: { stage: OrderStage }) {
  const tone =
    stage === 'cancelled'
      ? 'crit'
      : stage === 'billed' || stage === 'closed'
        ? 'done'
        : 'neutral';
  return <Tag tone={tone}>{orderStageLabel(stage)}</Tag>;
}

export function StatusTag({ status }: { status: OrderStatus }) {
  if (status === 'open') return null;
  return (
    <Tag tone={status === 'cancelled' ? 'crit' : 'done'}>
      {orderStatusLabel(status)}
    </Tag>
  );
}
