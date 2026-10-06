'use client';

import { useActionState } from 'react';
import type { OrderStatus } from '@/lib/types';
import { Button, Notice, Textarea } from './ui';

export type StatusState = { error?: string };

/**
 * Close, cancel or reopen an order, a PO or a WO. Each always states why, and
 * the reason goes to the activity log with the change. The server decides
 * whether the change is allowed (an order with documents on it cannot be
 * cancelled); this only offers the moves that make sense from where it is.
 */
export function StatusBox({
  action,
  id,
  status,
  kind,
}: {
  action: (state: StatusState, formData: FormData) => Promise<StatusState>;
  id: string;
  status: OrderStatus;
  /** 'po' or 'wo' for the shared Purchase and Work Order action. */
  kind?: 'po' | 'wo';
}) {
  const [state, submit, pending] = useActionState<StatusState, FormData>(
    action,
    {},
  );

  const moves: { status: OrderStatus; label: string }[] =
    status === 'open'
      ? [
          { status: 'closed', label: 'Close' },
          { status: 'cancelled', label: 'Cancel' },
        ]
      : [{ status: 'open', label: 'Reopen' }];

  return (
    <details className="rounded border border-[var(--color-line)] bg-white">
      <summary className="px-3 py-1.5 text-sm font-medium">
        {status === 'open' ? 'Close or Cancel' : 'Reopen'}
      </summary>
      <form action={submit} className="space-y-3 border-t border-[var(--color-line)] p-3">
        <input type="hidden" name="id" value={id} />
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Reason</span>
          <Textarea name="reason" required maxLength={300} />
        </label>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        <div className="flex flex-wrap gap-2">
          {moves.map((move) => (
            <Button
              key={move.status}
              type="submit"
              name="status"
              value={move.status}
              variant={move.status === 'cancelled' ? 'danger' : 'secondary'}
              disabled={pending}
            >
              {move.label}
            </Button>
          ))}
        </div>
      </form>
    </details>
  );
}
