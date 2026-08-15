import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from './ui';

/**
 * The row of filters over a register.
 *
 * A plain GET form, so a filtered list has an address that can be reloaded,
 * bookmarked or sent to somebody, which is the rule every list here follows.
 * Written once because four screens had grown their own copy of it and each
 * had drifted a little from the others.
 */

/** The shared control size: a tap target on a phone, dense at a desk. */
export const FILTER_CONTROL =
  'min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base sm:w-auto md:min-h-0 md:px-2.5 md:py-1.5 md:text-sm';

export function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block w-full sm:w-auto">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function FilterBar({
  children,
  clearHref,
  applyLabel = 'Apply',
}: {
  children: ReactNode;
  /** Where Clear goes, which is the list with nothing asked of it. */
  clearHref: string;
  applyLabel?: string;
}) {
  return (
    <Card className="mb-4 p-3">
      <form className="flex flex-wrap items-end gap-3">
        {children}
        <button className="inline-flex min-h-11 w-full items-center justify-center rounded bg-[var(--color-navy)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)] sm:w-auto md:min-h-0 md:px-3 md:py-1.5">
          {applyLabel}
        </button>
        <Link
          href={clearHref}
          className="inline-flex min-h-11 w-full items-center justify-center rounded border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm hover:bg-gray-50 sm:w-auto md:min-h-0 md:px-3 md:py-1.5"
        >
          Clear
        </Link>
      </form>
    </Card>
  );
}

/** From and To, the pair every register is read over. */
export function DateRangeFields({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  return (
    <>
      <FilterField label="From">
        <input
          type="date"
          name="from"
          defaultValue={from ?? ''}
          className={FILTER_CONTROL}
        />
      </FilterField>
      <FilterField label="To">
        <input
          type="date"
          name="to"
          defaultValue={to ?? ''}
          className={FILTER_CONTROL}
        />
      </FilterField>
    </>
  );
}
