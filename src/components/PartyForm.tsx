'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { PARTY_ROLES } from '@/lib/types';
import { Button, CancelLink, Field, FormActions, Notice, Textarea, TextInput } from './ui';
import { useKeptValues } from './use-kept-values';

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

  // What was typed stays typed when a save comes back with an error.
  const { values: field, set } = useKeptValues(
    {
      code: values.code,
      name: values.name,
      contactPerson: values.contactPerson,
      phone: values.phone,
      openingBalance: values.openingBalance,
      openingAsOf: values.openingAsOf,
      address: values.address,
    },
    state,
  );

  // Roles are several answers rather than one, so they are held apart from the
  // text fields, but for the same reason: a name already taken must not cost
  // whoever is adding the party the rest of what they filled in.
  const [roles, setRoles] = useState<string[]>(values.roles);
  const toggleRole = (role: string, on: boolean) =>
    setRoles((current) =>
      on ? [...new Set([...current, role])] : current.filter((r) => r !== role),
    );

  // A checkbox needs putting back after a failed save for the same reason a
  // select does, and useKeptValues cannot do it for them: React clears the form
  // once the action returns, and a controlled checkbox is left cleared while
  // this component still holds the roles that were ticked.
  const roleBoxes = useRef(new Map<string, HTMLInputElement | null>());
  useEffect(() => {
    for (const [role, box] of roleBoxes.current) {
      const wanted = roles.includes(role);
      if (box && box.checked !== wanted) box.checked = wanted;
    }
  }, [state, roles]);

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
            type="text"
            name="code"
            value={field.code}
            onChange={(e) => set({ code: e.target.value })}
            maxLength={20}
            placeholder="Assigned on save"
            autoComplete="off"
          />
        </Field>

        <Field label="Name">
          <TextInput
            type="text"
            name="name"
            value={field.name}
            onChange={(e) => set({ name: e.target.value })}
            required
            maxLength={200}
            autoComplete="off"
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
                  ref={(box) => {
                    roleBoxes.current.set(role.value, box);
                  }}
                  type="checkbox"
                  name="roles"
                  value={role.value}
                  checked={roles.includes(role.value)}
                  onChange={(e) => toggleRole(role.value, e.target.checked)}
                />
                {role.label}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Contact Person">
          <TextInput
            type="text"
            name="contactPerson"
            value={field.contactPerson}
            onChange={(e) => set({ contactPerson: e.target.value })}
            maxLength={120}
            autoComplete="off"
          />
        </Field>

        <Field label="Phone">
          <TextInput
            type="text"
            name="phone"
            value={field.phone}
            onChange={(e) => set({ phone: e.target.value })}
            maxLength={40}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Opening Balance (Tk)"
          hint="What was outstanding when you started using this app. Positive means owed."
        >
          <TextInput
            name="openingBalance"
            value={field.openingBalance}
            onChange={(e) => set({ openingBalance: e.target.value })}
            inputMode="decimal"
            className="text-right"
            required
          />
        </Field>

        <Field label="Opening Balance As Of">
          <TextInput
            type="date"
            name="openingAsOf"
            value={field.openingAsOf}
            onChange={(e) => set({ openingAsOf: e.target.value })}
          />
        </Field>

        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Address">
            <Textarea
              name="address"
              value={field.address}
              onChange={(e) => set({ address: e.target.value })}
              maxLength={400}
            />
          </Field>
        </div>
      </div>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <FormActions>
        <Button type="submit" icon="check" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
        {cancelHref ? <CancelLink href={cancelHref} /> : null}
      </FormActions>
    </form>
  );
}
