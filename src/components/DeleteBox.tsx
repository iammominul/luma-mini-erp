'use client';

import { useActionState } from 'react';
import { Button, ButtonIcon, look, Notice, Textarea } from './ui';

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
    // Closed, it is one more button in the row of actions, the same height as
    // its neighbors. Open, the reason form drops below it as a panel instead of
    // growing inside the row, which pushed every other action about.
    <details className="group relative">
      {/* The pointer comes from the base rule in globals.css, which covers a
          summary along with every button. */}
      <summary
        className={`${look({ variant: 'danger' })} list-none [&::-webkit-details-marker]:hidden`}
      >
        <ButtonIcon name="trash" />
        {title}
      </summary>
      <form
        action={submit}
        className="mt-1 space-y-3 rounded border border-crit/30 bg-white p-3 shadow-md md:absolute md:right-0 md:top-full md:z-30 md:w-80"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="side" value={side} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium md:text-body">
            Reason for Removal
          </span>
          <Textarea name="reason" required maxLength={300} />
        </label>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Button type="submit" variant="danger" icon="trash" disabled={pending}>
          {pending ? 'Removing' : confirmLabel}
        </Button>
      </form>
    </details>
  );
}
