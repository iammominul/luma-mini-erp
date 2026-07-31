'use client';

import { useActionState } from 'react';
import { Button, Notice, Textarea } from './ui';

export type DeleteState = { error?: string };

/**
 * Removing a posted entry needs a stated reason: the entry and the reason both
 * go to the activity log, which is append-only.
 */
export function DeleteBox({
  action,
  id,
  side,
  title,
  confirmLabel,
}: {
  action: (state: DeleteState, formData: FormData) => Promise<DeleteState>;
  id: string;
  side: string;
  title: string;
  confirmLabel: string;
}) {
  const [state, submit, pending] = useActionState<DeleteState, FormData>(
    action,
    {},
  );

  return (
    <details className="rounded border border-red-200 bg-white">
      <summary className="cursor-pointer px-3 py-1.5 text-sm font-medium text-red-700">
        {title}
      </summary>
      <form action={submit} className="space-y-3 border-t border-red-200 p-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="side" value={side} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Reason for Removal
          </span>
          <Textarea name="reason" required maxLength={300} />
        </label>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? 'Removing' : confirmLabel}
        </Button>
      </form>
    </details>
  );
}
