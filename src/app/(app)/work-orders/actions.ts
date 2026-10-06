'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createPurchaseOrder,
  createWorkOrder,
  setOrderDocStatus,
  updatePurchaseOrder,
  updateWorkOrder,
} from '@/lib/mutations';
import { getPurchaseOrder, getWorkOrder } from '@/lib/queries';
import {
  firstError,
  orderStatusFormSchema,
  purchaseOrderFormSchema,
  workOrderFormSchema,
} from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

/**
 * The actions behind Purchase Orders and Work Orders. One file for both,
 * because they are the same document aimed at a different party: the form
 * says which with a `kind` field, and each action checks its own permission.
 */

export type OrderDocFormState = { error?: string };

type Kind = 'po' | 'wo';

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function kindOf(formData: FormData): Kind {
  return text(formData, 'kind') === 'po' ? 'po' : 'wo';
}

const BASE: Record<Kind, string> = { po: '/purchase-orders', wo: '/work-orders' };

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

function header(formData: FormData) {
  return {
    partyId: text(formData, 'partyId'),
    orderDate: text(formData, 'orderDate'),
    deliverToId: text(formData, 'deliverToId'),
    deliveryBy: text(formData, 'deliveryBy'),
    terms: text(formData, 'terms'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
    lines: readLines(formData),
  };
}

async function docNoOf(kind: Kind, id: string): Promise<string> {
  const doc = kind === 'po' ? await getPurchaseOrder(id) : await getWorkOrder(id);
  return doc?.docNo ?? id;
}

export async function saveOrderDocAction(
  _previous: OrderDocFormState,
  formData: FormData,
): Promise<OrderDocFormState> {
  const kind = kindOf(formData);
  const id = text(formData, 'id');
  const editing = Boolean(id);
  let savedId = id;

  try {
    const actor = actorOf(await actingUser('bill:manage'));
    if (kind === 'po') {
      const parsed = purchaseOrderFormSchema.safeParse(header(formData));
      if (!parsed.success) return { error: firstError(parsed.error) };
      if (editing && !parsed.data.reason) {
        return { error: 'State why this order is being edited.' };
      }
      if (editing) await updatePurchaseOrder(id, parsed.data, actor);
      else savedId = await createPurchaseOrder(parsed.data, actor);
    } else {
      const parsed = workOrderFormSchema.safeParse({
        ...header(formData),
        process: text(formData, 'process'),
      });
      if (!parsed.success) return { error: firstError(parsed.error) };
      if (editing && !parsed.data.reason) {
        return { error: 'State why this order is being edited.' };
      }
      if (editing) await updateWorkOrder(id, parsed.data, actor);
      else savedId = await createWorkOrder(parsed.data, actor);
    }
  } catch (error) {
    return { error: message(error) };
  }

  const docNo = await docNoOf(kind, savedId);
  revalidatePath('/', 'layout');
  redirect(`${BASE[kind]}/${docNo}`);
}

export async function setOrderDocStatusAction(
  _previous: OrderDocFormState,
  formData: FormData,
): Promise<OrderDocFormState> {
  const kind = kindOf(formData);
  const parsed = orderStatusFormSchema.safeParse({
    id: text(formData, 'id'),
    status: text(formData, 'status'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('bill:manage');
    await setOrderDocStatus(
      kind,
      parsed.data.id,
      parsed.data.status,
      parsed.data.reason,
      actorOf(actor),
    );
  } catch (error) {
    return { error: message(error) };
  }
  const docNo = await docNoOf(kind, parsed.data.id);
  revalidatePath('/', 'layout');
  redirect(`${BASE[kind]}/${docNo}`);
}
