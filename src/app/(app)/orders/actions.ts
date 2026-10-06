'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createSalesOrder,
  setSalesOrderStatus,
  updateSalesOrder,
} from '@/lib/mutations';
import { getSalesOrder } from '@/lib/queries';
import {
  firstError,
  orderStatusFormSchema,
  salesOrderFormSchema,
} from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type OrderFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/** The line grid is posted as JSON, so a line never gets split across keys. */
function readLines(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get('linesJson') ?? '[]'));
  } catch {
    return [];
  }
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the order: ${(error as Error).message}`;
}

function readOrder(formData: FormData) {
  return salesOrderFormSchema.safeParse({
    partyId: text(formData, 'partyId'),
    orderDate: text(formData, 'orderDate'),
    customerRef: text(formData, 'customerRef'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
    lines: readLines(formData),
  });
}

/** Orders are billing documents, so they take the bill permissions. */
export async function createSalesOrderAction(
  _previous: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const parsed = readOrder(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  let id: string;
  try {
    const actor = await actingUser('bill:manage');
    id = await createSalesOrder(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }
  const saved = await getSalesOrder(id);
  revalidatePath('/', 'layout');
  redirect(`/orders/${saved?.docNo ?? id}`);
}

export async function updateSalesOrderAction(
  _previous: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const id = text(formData, 'id');
  const parsed = readOrder(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (!parsed.data.reason) return { error: 'State why this order is being edited.' };

  try {
    const actor = await actingUser('bill:manage');
    await updateSalesOrder(id, parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }
  const saved = await getSalesOrder(id);
  revalidatePath('/', 'layout');
  redirect(`/orders/${saved?.docNo ?? id}`);
}

export async function setSalesOrderStatusAction(
  _previous: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const parsed = orderStatusFormSchema.safeParse({
    id: text(formData, 'id'),
    status: text(formData, 'status'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('bill:manage');
    await setSalesOrderStatus(
      parsed.data.id,
      parsed.data.status,
      parsed.data.reason,
      actorOf(actor),
    );
  } catch (error) {
    return { error: message(error) };
  }
  const saved = await getSalesOrder(parsed.data.id);
  revalidatePath('/', 'layout');
  redirect(`/orders/${saved?.docNo ?? parsed.data.id}`);
}
