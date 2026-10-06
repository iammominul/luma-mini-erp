'use client';

import { useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { quickCreatePartyAction } from '@/app/(app)/parties/actions';
import type { PartyRole } from '@/lib/types';
import { Button, Field, Notice, Select, TextInput } from './ui';

/**
 * The party select on a document form, with New Party beside it (2026-10-06).
 *
 * A new buyer turns up while a bill or an order is being keyed, and the old
 * answer was to leave the form, add the party, and key the document again.
 * The dialog here creates the party without leaving: it holds the three fields
 * a party needs to be billed, saves through the same action and mutation as
 * the full party form, and puts the new party straight into this select.
 *
 * It sits inside the document's form, so nothing in it carries a name and its
 * buttons are type="button": the dialog is never posted with the document, and
 * Enter in one of its fields saves the party rather than the bill. A dialog
 * closed by mistake loses three short fields, never the document behind it,
 * which is why a document itself is never put in a dialog (rule 12).
 */
export function PartyPicker({
  role,
  label,
  parties,
  value,
  onChange,
  selectRef,
  name = 'partyId',
  canCreate,
  required = true,
}: {
  role: PartyRole;
  label: string;
  parties: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  /** useKeptValues' register, so the select survives a failed save. */
  selectRef?: Ref<HTMLSelectElement>;
  name?: string;
  /** Whether the signed-in role may add a party at all. */
  canCreate: boolean;
  required?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState({ name: '', phone: '', address: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = [...parties, ...added.filter((a) => !parties.some((p) => p.id === a.id))];
  const word = label.toLowerCase();

  const open = () => {
    setDraft({ name: '', phone: '', address: '' });
    setError(null);
    dialog.current?.showModal();
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await quickCreatePartyAction({ ...draft, role });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setAdded((current) => [...current, result]);
    onChange(result.id);
    dialog.current?.close();
  };

  // Enter in the dialog saves the party, never the document underneath it.
  const keepEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    }
  };

  return (
    <div>
      <Field label={label}>
        <div className="flex gap-2">
          <Select
            ref={selectRef}
            name={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            className="min-w-0 flex-1"
          >
            <option value="">Select {label}</option>
            {options.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </Select>
          {canCreate ? (
            <Button type="button" variant="secondary" icon="plus" onClick={open}>
              New
            </Button>
          ) : null}
        </div>
      </Field>

      {canCreate ? (
        <dialog
          ref={dialog}
          className="w-[min(28rem,calc(100vw-2rem))] rounded border border-[var(--color-rule)] bg-white p-0 backdrop:bg-black/30"
          aria-label={`New ${label}`}
        >
          <div className="border-b border-[var(--color-rule)] px-4 py-2.5">
            <h2 className="text-sm font-semibold">New {label}</h2>
          </div>
          <div className="space-y-3 p-4">
            <Field label="Name">
              <TextInput
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={keepEnter}
                maxLength={200}
                autoComplete="off"
                autoFocus
              />
            </Field>
            <Field label="Phone">
              <TextInput
                type="text"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                onKeyDown={keepEnter}
                maxLength={40}
                autoComplete="off"
              />
            </Field>
            <Field label="Address">
              <TextInput
                type="text"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                onKeyDown={keepEnter}
                maxLength={400}
                autoComplete="off"
              />
            </Field>
            <p className="text-xs text-[var(--color-muted)]">
              Added as a {word}. Contact person and opening balance on the
              party screen.
            </p>
            {error ? <Notice tone="error">{error}</Notice> : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--color-rule)] px-4 py-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </Button>
            <Button type="button" icon="check" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving' : `Add ${label}`}
            </Button>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
