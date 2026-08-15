import Link from 'next/link';
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithRef,
  ReactNode,
} from 'react';
import { Crumb } from './Crumb';

/**
 * The same hand-rolled primitives the real ERP frontend uses: classic office
 * software, dense bordered tables, one navy accent.
 *
 * Sizes below `md` are the ones a thumb has to hit, so buttons and fields are
 * given the room for that and go back to the dense desktop figures at `md`.
 * Nothing about how this looks on a desk changes.
 */

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy-600)]',
  secondary:
    'bg-white text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-gray-50',
  danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50',
};

// 44px is the smallest a control should be to be tapped reliably. Written once
// because a button, a download and a cancel link all have to agree on it. At
// md it drops to the prototype's 26px, which is the height a row of actions
// above a dense table has to be to look like it belongs to the table.
const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center rounded px-4 py-2.5 text-sm font-medium transition-colors md:min-h-0 md:h-[26px] md:px-2.5 md:py-0 md:text-[12px]';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`${BUTTON_BASE} disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

/**
 * A download, styled as a button. A plain anchor rather than a Link: the target
 * is a PDF route that streams a file, and Next's client router would try to
 * navigate to it.
 */
export function DownloadButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <a href={href} className={`${BUTTON_BASE} ${BUTTON_STYLES[variant]}`}>
      {children}
    </a>
  );
}

/**
 * Cancel, as a button. Eight forms had this written out by hand, which is eight
 * places for the touch size to be missed.
 */
export function CancelLink({
  href,
  children = 'Cancel',
}: {
  href: string;
  children?: ReactNode;
}) {
  return (
    <Link href={href} className={`${BUTTON_BASE} ${BUTTON_STYLES.secondary}`}>
      {children}
    </Link>
  );
}

/**
 * The row of actions at the foot of a form. Stacked and full width on a phone,
 * where the thumb reaches the bottom of the screen and two half width buttons
 * beside each other is the shape that gets the wrong tap.
 */
export function FormActions({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:items-center ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A download, as an icon in a row of actions. One outline glyph, drawn inline:
 * an icon font or a sprite would be another asset to ship for a single mark.
 * The label stays in the title and for screen readers, so the action is never
 * only a shape.
 */
export function DownloadIcon({
  href,
  label = 'Download PDF',
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded border border-[var(--color-line)] bg-white text-[var(--color-navy)] hover:bg-gray-50 md:h-7 md:w-7"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-4 w-4 md:h-3.5 md:w-3.5"
      >
        <path d="M8 2v8" />
        <path d="M4.5 7 8 10.5 11.5 7" />
        <path d="M2.5 13.5h11" />
      </svg>
    </a>
  );
}

// 16px below md is not a matter of taste: iOS Safari zooms the page whenever a
// focused field's text is smaller than that, and a bill form that zooms on
// every field is one somebody has to pinch back out of twelve times. The
// padding and line height clear 44px on their own, so there is no min-height
// here: setting one fights Safari's own sizing of a date field.
const CONTROL =
  'w-full rounded border border-[var(--color-rule)] bg-white px-3 py-2.5 text-base outline-none focus:border-[var(--color-navy)] focus:ring-1 focus:ring-[var(--color-navy)] md:px-2 md:py-1 md:text-[12.5px]';

// These take a ref, which a select needs: React resets a form once an action
// returns, and a controlled select has to be put back by hand afterwards. See
// use-kept-values.ts. In React 19 a ref is an ordinary prop, so it spreads on
// with the rest and no forwarding is involved.
export function TextInput({
  className = '',
  ...props
}: ComponentPropsWithRef<'input'>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Select({
  className = '',
  ...props
}: ComponentPropsWithRef<'select'>) {
  return <select className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  ...props
}: ComponentPropsWithRef<'textarea'>) {
  return <textarea className={`${CONTROL} ${className}`} rows={2} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-[var(--color-muted)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Card({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  /** An anchor, for a link that has to land on this card rather than the page. */
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded border border-[var(--color-rule)] bg-white ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-rule)] px-4 py-2.5 md:py-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

/**
 * The head of a screen, in the prototype's shape: the menu group above the
 * title, the title, what the figures are as of, the period the screen is
 * showing, and the actions on the right.
 *
 * It pins to the top of the work area at `md`, so the title, the period and
 * Download PDF stay reachable down a long register. Two things make that safe:
 *
 *  - It pins only at `md`. Below that the page itself scrolls under a sticky
 *    bar rather than the work area scrolling inside a fixed shell, so pinning
 *    here would stack a second band under the first and spend room a phone
 *    does not have.
 *  - It sits a layer above a sticky table heading. Whether a heading can
 *    actually scroll up to the head is beside the point: `position: sticky`
 *    paints in the positioned layer wherever the element happens to be, so at
 *    an equal z-index the heading wins for being later in the document, and its
 *    background shows through the head while the rest of its card is properly
 *    hidden. The head is z-20 and a heading is z-10. The whole scale is in
 *    globals.css.
 */
export function PageTitle({
  title,
  subtitle,
  asOf,
  controls,
  action,
}: {
  title: string;
  subtitle?: string;
  /** What the figures on this screen are as of, in Asia/Dhaka. */
  asOf?: string;
  /** The period this screen is showing, for a screen that has one. */
  controls?: ReactNode;
  action?: ReactNode;
}) {
  return (
    // The head paints the space above the title itself, and the work area has
    // no top padding for it to sit under. Both halves of that matter: a sticky
    // child pins at the top of its container's padding box, so any padding the
    // container keeps is a strip the head cannot reach and rows scroll up
    // through it. Cancelling that padding with a negative margin was tried and
    // is not the same thing, because the head's own painted box still started
    // below it.
    //
    // Nothing pulls sideways. That was tried too and cannot work here: the work
    // area sets an overflow, so a child wider than its content box adds
    // scrollable width on the right and is clipped on the left, which put a
    // sideways scrollbar on every screen. The rule stops at the content edge,
    // where it lines up with the cards under it anyway.
    //
    // z-20 is the head's layer, and it has to be above the table headings at
    // z-10. It is not enough that a heading cannot scroll up here: a heading is
    // `position: sticky`, so it paints in the positioned layer whatever it is
    // doing, and at an equal z-index the one later in the document wins. A row
    // of column headings was showing straight through the head while the rest
    // of its card was correctly hidden behind it. The scale is written out in
    // globals.css.
    <div className="mb-4 border-b border-[var(--color-rule)] bg-[var(--color-canvas)] pb-2.5 md:sticky md:top-0 md:z-20 md:pb-2 md:pt-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="min-w-0">
          <Crumb />
          <h1 className="text-base font-semibold tracking-[-0.01em]">{title}</h1>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-[var(--color-ink-3)] md:text-[12px]">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 lg:shrink-0 lg:justify-end">
          {asOf ? (
            <span className="hidden self-center text-[11.5px] text-[var(--color-ink-3)] sm:block">
              {asOf}
            </span>
          ) : null}
          {controls}
          {action}
        </div>
      </div>
    </div>
  );
}

/**
 * A section of a screen, ruled off from the next one rather than boxed.
 *
 * A dashboard built out of Cards on canvas is a page of floating boxes, which
 * is the look the style rules rule out. A band is what an accounts screen
 * actually does: a quiet heading, the figures under it, a rule, the next one.
 * `Card` is still right for a form and for a list that stands on its own.
 */
export function Band({
  title,
  children,
  action,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border-b border-[var(--color-rule-soft)] py-3 last:border-b-0 ${className}`}
    >
      {title ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-3)]">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A dense bordered data table, the way an accounts screen reads.
 *
 * `sticky` keeps the headings in view on a long list. It needs the wrapper to
 * be the scrolling element, because a horizontally scrolling box cannot also
 * let a header stick to the page behind it: setting overflow on one axis makes
 * the browser scroll the other one too.
 */
export function Table({
  children,
  sticky = false,
}: {
  children: ReactNode;
  sticky?: boolean;
}) {
  return (
    <div className={sticky ? 'max-h-[70vh] overflow-auto' : 'overflow-x-auto'}>
      <table className="w-full border-collapse text-sm md:text-[12.5px]">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  numeric = false,
  className = '',
  sorted,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
  /** Set on a column the list can be ordered by, so the heading says how it is. */
  sorted?: 'ascending' | 'descending' | 'none';
}) {
  return (
    <th
      aria-sort={sorted}
      className={`sticky top-0 z-10 whitespace-nowrap border-b border-[var(--color-rule)] bg-[var(--color-surface-2)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-2)] md:h-[26px] md:px-[9px] md:py-0 md:text-[11px] ${
        numeric ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  className = '',
  colSpan,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-[var(--color-rule-soft)] px-3 py-2 align-top md:h-[var(--row)] md:px-[9px] md:py-1 ${
        numeric ? 'numeric' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function EmptyRow({
  columns,
  children,
}: {
  columns: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <Td colSpan={columns} className="text-center text-[var(--color-muted)]">
        {children}
      </Td>
    </tr>
  );
}

export function Notice({
  children,
  tone = 'info',
  className = '',
}: {
  children: ReactNode;
  /** 'warning' states a condition worth acting on that is not a failure. */
  tone?: 'info' | 'warning' | 'error';
  className?: string;
}) {
  // The two states carry a reserved color and a tinted ground, and the text
  // itself stays the state color rather than a near black, so a message that
  // matters is legible as one before it is read.
  const TONES = {
    error:
      'border-[var(--color-crit)]/40 bg-[var(--color-crit)]/5 text-[var(--color-crit)]',
    warning:
      'border-[var(--color-warn)]/40 bg-[var(--color-warn)]/5 text-[var(--color-warn)]',
    info: 'border-[var(--color-rule)] bg-white text-[var(--color-ink)]',
  };
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-2)]">
        {label}
      </div>
      {/* A tile is the one place a figure is read on its own rather than down a
          column, and it is still a figure, so it is set in the same face. */}
      <div className="figure mt-1 text-xl font-medium">{value}</div>
      {note ? (
        <div className="mt-1 text-xs text-[var(--color-ink-3)]">{note}</div>
      ) : null}
    </Card>
  );
}
