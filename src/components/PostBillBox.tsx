'use client';

import { useActionState } from 'react';
import { Button, Notice } from './ui';

export type PostBillState = { error?: string };

/**
 * Posts a draft into the book. Deliberately a plain button rather than a
 * confirmation dance: posting is the ordinary next step for a draft, and the
 * bill can still be edited afterwards with a reason.
 */
export function PostBillBox({
  action,
  id,
  side,
}: {
  action: (state: PostBillState, formData: FormData) => Promise<PostBillState>;
  id: string;
  side: string;
}) {
  const [state, submit, pending] = useActionState<PostBillState, FormData>(
    action,
    {},
  );

  return (
    <form action={submit} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="side" value={side} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Posting' : 'Post Bill'}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}
