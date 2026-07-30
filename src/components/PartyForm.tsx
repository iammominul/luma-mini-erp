'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button, Field, Notice, Select, Textarea, TextInput } from './ui';

export type PartyFormState = { error?: string };

export type PartyFormValues = {
  name: string;
  type: string;
  contactPerson: string;
  phone: string;
  address: string;
  openingBalance: string;
  openingAsOf: string;
};

export function PartyForm({
  action,
  values,
  submitLabel,
  cancelHref,
  partyId,
  lockType = false,
}: {
  action: (
    state: PartyFormState,
    formData: FormData,
  ) => Promise<PartyFormState>;
  values: PartyFormValues;
  submitLabel: string;
  cancelHref?: string;
  partyId?: string;
  /** A party type is immutable once set, the same as in the real ERP. */
  lockType?: boolean;
}) {
  const [state, submit, pending] = useActionState<PartyFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={submit} className="space-y-4">
      {partyId ? <input type="hidden" name="id" value={partyId} /> : null}
      {lockType ? (
        <input type="hidden" name="type" value={values.type} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name">
          <TextInput
            name="name"
            defaultValue={values.name}
            required
            maxLength={200}
          />
        </Field>

        <Field
          label="Type"
          hint={lockType ? 'A party type cannot be changed.' : undefined}
        >
          <Select
            name={lockType ? 'typeDisplay' : 'type'}
            defaultValue={values.type}
            disabled={lockType}
            required
          >
            <option value="customer">Customer</option>
            <option value="subcontractor">Subcontractor</option>
          </Select>
        </Field>

        <Field label="Contact Person">
          <TextInput
            name="contactPerson"
            defaultValue={values.contactPerson}
            maxLength={120}
          />
        </Field>

        <Field label="Phone">
          <TextInput name="phone" defaultValue={values.phone} maxLength={40} />
        </Field>

        <Field
          label="Opening Balance (Tk)"
          hint="What was outstanding when you started using this app. Positive means owed."
        >
          <TextInput
            name="openingBalance"
            defaultValue={values.openingBalance}
            inputMode="decimal"
            className="text-right"
            required
          />
        </Field>

        <Field label="Opening Balance As Of">
          <TextInput
            type="date"
            name="openingAsOf"
            defaultValue={values.openingAsOf}
          />
        </Field>

        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Address">
            <Textarea
              name="address"
              defaultValue={values.address}
              maxLength={400}
            />
          </Field>
        </div>
      </div>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
        {cancelHref ? (
          <Link
            href={cancelHref}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}
