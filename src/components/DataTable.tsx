import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyRow, Td, Th } from './ui';

/**
 * A register that reads as a table on a desk and as a stack of records on a
 * phone, from one description of its columns.
 *
 * The reason it is one description and not two blocks of markup: these are
 * money screens, and a second hand written layout is a second place a figure
 * can be put in the wrong column. Here every column has exactly one `cell`
 * function, called once for the row and once for the card, so the two cannot
 * disagree about what a bill is worth.
 *
 * Below `md` a row becomes a block: the columns marked `title` lead it, the
 * ones marked `meta` sit under that in muted text, and the rest are laid out as
 * labeled pairs two to a line. Nothing is put behind a sideways scroll, because
 * a figure a clerk has to remember to swipe for is a figure they will miss.
 */

export type Column<T> = {
  /** Names the column to the total row. Never rendered. */
  key: string;
  /** The heading on the table, and the label beside the value on a phone. */
  head: string;
  numeric?: boolean;
  /** Classes for the heading cell. Widths belong here, and apply at md and up. */
  headClassName?: string;
  /** Classes for the body cell in the table. */
  cellClassName?: string;
  /** Classes for the value on a phone. */
  phoneClassName?: string;
  /**
   * The cell.
   *
   * It must be a pure function of the row, and it must never carry a `name`
   * belonging to an enclosing form: both layouts are in the document at once,
   * so a cell that posts would post twice. A cell may hold a form of its own.
   */
  cell: (row: T, index: number) => ReactNode;
  /**
   * How the column reads on a phone. Defaults to `pair`.
   *
   * `title`  names the record, and leads the block
   * `amount` the figure the record is about, on the title line, right aligned
   * `meta`   a second line under the title, muted, joined with the other meta
   * `pair`   a label and a value, two to a line
   * `full`   a line of its own, for a description, an action or an inline form
   * `off`    not rendered on a phone. Either the value already reaches the
   *          block another way, or it lives on the record's own page one tap
   *          away, which is what `rowHref` is for. It never means a figure
   *          that can only be reached by scrolling sideways.
   */
  phone?: 'title' | 'amount' | 'meta' | 'pair' | 'full' | 'off';
  /**
   * Which layout renders this column. Both, unless it says otherwise.
   *
   * This is how one column array serves two shapes that are not the same
   * shape. A bill line is ten columns at a desk and reads as `weight x rate =
   * amount` on a phone: the ten stay `table`, and a couple of `phone` columns
   * compose them into the lines a phone shows. One array is still the single
   * source, so the two layouts cannot disagree about a figure.
   */
  only?: 'table' | 'phone';
  /** Set to make the heading order the list. */
  sortHref?: string;
  sorted?: 'ascending' | 'descending' | 'none';
};

/**
 * The figures under the list, given once and rendered in both layouts. The
 * label's span is worked out from where the first figure sits, so no page
 * counts its own columns: that arithmetic is what goes wrong when somebody
 * later adds one.
 */
export type Total = {
  label: ReactNode;
  cells: Record<string, ReactNode>;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName = '',
  empty = 'Nothing recorded',
  total,
  sticky = false,
  rowHref,
  rowAction,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** A function when the row's own state changes how it reads, as a disabled account does. */
  rowClassName?: string | ((row: T) => string);
  empty?: ReactNode;
  total?: Total;
  sticky?: boolean;
  /**
   * Where the record lives. Set it whenever the list has a detail page: on a
   * phone the whole block becomes the link, so a thumb has the row to aim at
   * rather than a word inside it.
   */
  rowHref?: (row: T) => string;
  /**
   * One control beside the row, outside the link.
   *
   * Outside is not a detail. `DownloadIcon` renders an anchor, and an anchor
   * inside an anchor is invalid and behaves differently in every browser, so a
   * trailing action has to be a sibling of the row link rather than a child.
   */
  rowAction?: (row: T) => ReactNode;
}) {
  const rowClass = (row: T) =>
    typeof rowClassName === 'function' ? rowClassName(row) : rowClassName;

  const tableColumns = columns.filter((column) => column.only !== 'phone');
  const shown = columns.filter(
    (column) => column.phone !== 'off' && column.only !== 'table',
  );
  const titles = shown.filter((column) => column.phone === 'title');
  const amounts = shown.filter((column) => column.phone === 'amount');
  const metas = shown.filter((column) => column.phone === 'meta');
  const rest = shown.filter(
    (column) =>
      column.phone !== 'title' &&
      column.phone !== 'amount' &&
      column.phone !== 'meta',
  );
  const sortable = tableColumns.filter((column) => column.sortHref);

  // Where the label in the total row stops and the figures start.
  const firstTotal = total
    ? tableColumns.findIndex((column) => column.key in total.cells)
    : -1;

  return (
    <>
      {/* The register, unchanged from what it has always been at a desk. */}
      <div
        className={`hidden md:block ${
          sticky ? 'max-h-[70vh] overflow-auto' : 'overflow-x-auto'
        }`}
      >
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {tableColumns.map((column) => (
                <Th
                  key={column.key}
                  numeric={column.numeric}
                  className={column.headClassName}
                  sorted={column.sorted}
                >
                  {column.sortHref ? (
                    <Link
                      href={column.sortHref}
                      className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-[var(--color-navy)]"
                    >
                      {column.head}
                      {/* The mark is drawn on every sortable heading and only
                          colored on the one in use, so turning a column around
                          does not shift the row of headings sideways. */}
                      <span
                        aria-hidden="true"
                        className={
                          column.sorted && column.sorted !== 'none'
                            ? 'text-[var(--color-navy)]'
                            : 'text-transparent'
                        }
                      >
                        {column.sorted === 'ascending' ? '▲' : '▼'}
                      </span>
                    </Link>
                  ) : (
                    column.head
                  )}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow columns={tableColumns.length}>{empty}</EmptyRow>
            ) : (
              rows.map((row, index) => (
                <tr key={rowKey(row, index)} className={rowClass(row)}>
                  {tableColumns.map((column) => (
                    <Td
                      key={column.key}
                      numeric={column.numeric}
                      className={column.cellClassName}
                    >
                      {column.cell(row, index)}
                    </Td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {total && rows.length > 0 ? (
            <tfoot>
              {/* A total is closed off from the rows above it with the strong
                  rule, not the soft one that separates two ordinary rows. */}
              <tr className="border-t border-[var(--color-rule)] bg-[var(--color-surface-3)] font-semibold">
                {firstTotal > 0 ? (
                  <Td colSpan={firstTotal}>{total.label}</Td>
                ) : null}
                {tableColumns.slice(Math.max(firstTotal, 0)).map((column) => (
                  <Td key={column.key} numeric={column.numeric}>
                    {total.cells[column.key] ?? null}
                  </Td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {/* One block per record. */}
      <div className="md:hidden">
        {/* Ordering lives in the column headings, and there are no headings
            here, so a register that can be sorted says so in a row of its own.
            These are the same links, so the URL still carries the order. */}
        {sortable.length > 0 && rows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Sort
            </span>
            {sortable.map((column) => {
              const on = column.sorted && column.sorted !== 'none';
              return (
                <Link
                  key={column.key}
                  href={column.sortHref!}
                  aria-label={`Sort by ${column.head}`}
                  className={`inline-flex min-h-8 items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium ${
                    on
                      ? 'border-[var(--color-navy)] bg-white text-[var(--color-navy)]'
                      : 'border-[var(--color-line)] bg-white text-[var(--color-muted)]'
                  }`}
                >
                  {column.head}
                  {on ? (
                    <span aria-hidden="true">
                      {column.sorted === 'ascending' ? '▲' : '▼'}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
            {empty}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {rows.map((row, index) => {
              const body = (
                <>
                  {titles.length > 0 || amounts.length > 0 ? (
                    // Identity on the left, the figure the record is about on
                    // the right. The name truncates rather than pushing the
                    // amount off, because a long party name is common and a
                    // half visible figure is not a figure.
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium">
                        {titles.map((column) => (
                          <span
                            key={column.key}
                            className={`truncate ${column.phoneClassName ?? ''}`}
                          >
                            {column.cell(row, index)}
                          </span>
                        ))}
                      </div>
                      {amounts.map((column) => (
                        <span
                          key={column.key}
                          className={`figure shrink-0 whitespace-nowrap text-sm font-medium ${
                            column.phoneClassName ?? ''
                          }`}
                        >
                          {column.cell(row, index)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {metas.length > 0 ? (
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-muted)]">
                      {metas.map((column) => {
                        // A meta that has nothing to say says nothing. Status
                        // is empty on a bill that is posted and complete, and
                        // an empty span still takes the row's gap.
                        const value = column.cell(row, index);
                        if (value === null || value === undefined || value === '') {
                          return null;
                        }
                        return (
                          <span key={column.key} className={column.phoneClassName}>
                            {value}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}

                  {rest.length > 0 ? (
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                      {rest.map((column) => (
                        <Pair
                          key={column.key}
                          column={column}
                          value={column.cell(row, index)}
                        />
                      ))}
                    </dl>
                  ) : null}
                </>
              );

              return (
                <li
                  key={rowKey(row, index)}
                  className={`flex items-stretch ${rowClass(row) ?? ''}`}
                >
                  {rowHref ? (
                    <Link
                      href={rowHref(row)}
                      className="min-w-0 flex-1 px-3 py-3 active:bg-[var(--color-canvas)]"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="min-w-0 flex-1 px-3 py-3">{body}</div>
                  )}
                  {rowAction ? (
                    <div className="flex shrink-0 items-center pr-2">
                      {rowAction(row)}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {total && rows.length > 0 ? (
          <div className="border-t border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              {total.label}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
              {tableColumns
                .filter((column) => column.key in total.cells)
                .map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                      {column.head}
                    </dt>
                    <dd className="figure mt-0.5 whitespace-nowrap text-sm font-medium">
                      {total.cells[column.key]}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Pair<T>({
  column,
  value,
}: {
  column: Column<T>;
  value: ReactNode;
}) {
  const full = column.phone === 'full';
  // A labelled pair holds its place in the grid even when empty, because the
  // label is still telling the reader the field exists and is blank. One with
  // no label is only a line of text, and an empty line of text is a gap.
  if (!column.head && (value === null || value === undefined || value === '')) {
    return null;
  }
  return (
    <div className={`min-w-0 ${full ? 'col-span-2' : ''}`}>
      {column.head ? (
        <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
          {column.head}
        </dt>
      ) : null}
      {/* Not the `.numeric` class: it is unlayered CSS and so beats every
          Tailwind utility written beside it. The nowrap it carries is the part
          worth keeping here, and the body already sets tabular figures. */}
      <dd
        className={`${column.head ? 'mt-0.5' : ''} text-sm ${
          column.numeric ? 'whitespace-nowrap' : ''
        } ${column.phoneClassName ?? ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
