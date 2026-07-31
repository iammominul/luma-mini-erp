'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { PARTY_ROLES } from '@/lib/types';
import { Button, Field, Notice, Textarea, TextInput } from './ui';

export type PartyFormState = { error?: string };

export type PartyFormValues = {
  code: string;
  name: string;
  roles: string[];
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
}: {
  action: (
    state: PartyFormState,
    formData: FormData,
  ) => Promise<PartyFormState>;
  values: PartyFormValues;
  submitLabel: string;
  cancelHref?: string;
  partyId?: string;
}) {
  const [state, submit, pending] = useActionState<PartyFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={submit} className="space-y-4">
      {partyId ? <input type="hidden" name="id" value={partyId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Party Code"
          hint={
            partyId
              ? 'The key this party is known by.'
              : 'Left blank, the system assigns the next one.'
          }
        >
          <TextInput
            name="code"
            defaultValue={values.code}
            maxLength={20}
            placeholder="Assigned on save"
            autoComplete="off"
          />
        </Field>

        <Field label="Name">
          <TextInput
            name="name"
            defaultValue={values.name}
            required
            maxLength={200}
          />
        </Field>

        <Field
          label="Roles"
          hint="A party can hold more than one. A role that has been traded under cannot be removed."
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {PARTY_ROLES.map((role) => (
              <label
                key={role.value}
                className="flex items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  name="roles"
                  value={role.value}
                  defaultChecked={values.roles.includes(role.value)}
                />
                {role.label}
              </label>
            ))}
          </div>
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
