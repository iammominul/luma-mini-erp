'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { flash } from '@/lib/flash';
import { isAudience } from '@/lib/modules';
import { InputError, setModuleSwitch } from '@/lib/mutations';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

/**
 * Switch one of the full ERP's modules for an audience. Owner only, checked
 * here for itself: a server action is a public endpoint.
 *
 * The form is a single select whose value is the saved state, so there is
 * nothing typed to lose. A refusal comes back on the address and is shown on
 * the screen as an error, never as a green flash.
 */
export async function setModuleSwitchAction(formData: FormData): Promise<void> {
  const code = String(formData.get('module') ?? '');
  const audience = String(formData.get('audience') ?? '');

  let error: string | null = null;
  try {
    if (!isAudience(audience)) throw new InputError('Choose who sees the module.');
    const actor = await actingUser('module:manage');
    await setModuleSwitch(code, audience, actorOf(actor));
  } catch (caught) {
    if (caught instanceof ForbiddenError || caught instanceof InputError) {
      error = caught.message;
    } else {
      throw caught;
    }
  }

  if (error) redirect(`/modules?error=${encodeURIComponent(error)}`);
  revalidatePath('/', 'layout');
  await flash('Module saved.');
  redirect('/modules');
}
