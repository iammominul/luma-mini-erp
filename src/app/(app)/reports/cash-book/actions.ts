'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { InputError, setOpeningBalance } from '@/lib/mutations';
import { firstError, openingBalanceSchema } from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type OpeningBalanceState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/**
 * The balance the book opens on, set once.
 *
 * It lives on the Cash Book because that is the screen it changes, and it is
 * not the owner's money so it does not belong on the owner's account. There is
 * one, and a unique index on the category is what holds that.
 */
export async function setOpeningBalanceAction(
  _previous: OpeningBalanceState,
  formData: FormData,
): Promise<OpeningBalanceState> {
  const parsed = openingBalanceSchema.safeParse({
    movedOn: text(formData, 'movedOn'),
    amount: text(formData, 'amount'),
    mode: text(formData, 'mode'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('fund:manage');
    await setOpeningBalance(parsed.data, actorOf(actor));
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: error.message };
    if (error instanceof InputError) return { error: error.message };
    if (error instanceof z.ZodError) return { error: firstError(error) };
    return { error: `Could not save it: ${(error as Error).message}` };
  }

  revalidatePath('/', 'layout');
  redirect('/reports/cash-book');
}
