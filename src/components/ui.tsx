import Link from 'next/link';
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithRef,
  ReactNode,
} from 'react';
import { Crumb } from './Crumb';
import { Icon, type IconName } from './Icon';

/**
 * The same hand-rolled primitives the real ERP frontend uses: classic office
 * software, dense bordered tables, one navy accent.
 *
 * Sizes below `md` are the ones a thumb has to hit, so buttons and fields are
 * given the room for that and go back to the dense desktop figures at `md`.
 * Nothing about how this looks on a desk changes.
 */

type ButtonVariant = 'primary' | 'secondary' | 'danger';

/**
 * Two sizes, because the app genuinely has two and flattening them breaks
 * something.
 *
 * `default` is the prototype's 26px at `md`, which is the height a row of
 * actions over a dense table has to be to look like it belongs to the table,
 * and it is the same 26px as a column heading.
 *
 * `filter` is taller, and it exists for the filter rows only. `FILTER_CONTROL`
 * in FilterBar.tsx is a taller control than `CONTROL` is here, so an Apply
 * button at 26px would stop sitting on the same baseline as the fields it is
 * beside. The size was already in the code, written out by hand in about
 * fourteen files; naming it is what stops it drifting again.
 */
type ButtonSize = 'default' | 'filter';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy-600)]',
  secondary:
    'bg-white text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-gray-50',
  danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50',
};

// 44px is the smallest a control should be to be tapped reliably. Written once
// because a button, a download and a cancel link all have to agree on it.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  default:
    'min-h-11 px-4 py-2.5 text-sm md:min-h-0 md:h-[26px] md:px-2.5 md:py-0 md:text-[12px]',
  filter: 'min-h-11 px-4 py-2.5 text-sm md:min-h-0 md:px-3 md:py-1.5',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors';

/** Full width on a phone, its own width from `sm` up. */
const BLOCK = 'w-full sm:w-auto';

/**
 * The mark on a button, sized down at `md` because the button itself drops to
 * 26px with a 12px label there and a full 16px glyph beside that reads as an
 * icon with a word stuck to it.
 */
function ButtonIcon({ name }: { name: IconName }) {
  return <Icon name={name} className="h-4 w-4 md:h-3.5 md:w-3.5" />;
}

type ButtonLook = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width below `sm`, for an action a thumb reaches for. */
  block?: boolean;
  /** The mark before the label. Actions that name a verb take one. */
  icon?: IconName;
};

function look({
  variant = 'primary',
  size = 'default',
  block = false,
}: ButtonLook) {
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_STYLES[variant]} ${
    block ? BLOCK : ''
  }`;
}

export function Button({
  variant,
  size,
  block,
  icon,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonLook) {
  return (
    <button
      className={`${look({ variant, size, block })} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {icon ? <ButtonIcon name={icon} /> : null}
      {children}
    </button>
  );
}

/**
 * A link, styled as a button.
 *
 * This is what about forty hand-written copies of the button class string were
 * doing across fourteen files, and they had drifted: none of them picked up the
 * 26px height or the 12px type, so the primary action on every register was a
 * different size from every other button on the same screen.
 */
export function LinkButton({
  href,
  variant,
  size,
  block,
  icon,
  className = '',
  children,
}: ButtonLook & {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${look({ variant, size, block })} ${className}`}
    >
      {icon ? <ButtonIcon name={icon} /> : null}
      {children}
    </Link>
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
  variant,
  size,
  block,
  icon = 'download',
}: ButtonLook & {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={look({ variant, size, block })}>
      {icon ? <ButtonIcon name={icon} /> : null}
      {children}
    </a>
  );
}

/**
 * Cancel, as a button. Eight forms had this written out by hand, which is eight
 * places for the touch size to be missed. It takes no icon: Cancel is the way
 * out of a form, not one of the things the form does.
 */
export function CancelLink({
  href,
  children = 'Cancel',
}: {
  href: string;
  children?: ReactNode;
}) {
  return (
    <LinkButton href={href} variant="secondary">
      {children}
    </LinkButton>
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
 * A download, as an icon in a row of actions. The label stays in the title and
 * for screen readers, so the action is never only a shape.
 *
 * The glyph used to be inlined here. It is now the shared `download` mark, so
 * the icon in a table row and the icon on the Download PDF button are the same
 * drawing rather than two that happen to look alike.
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
      <ButtonIcon name="download" />
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
          <h1 className="text-base font-semibold tracking-[-0.01em]">
            {title}
          </h1>
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
 * A short list of label and figure, the way a statement reads.
 *
 * This is what a summary inside a Band wants: four or five figures in a column
 * with the amounts aligned, not four more tiles. `strong` closes a section the
 * way a total does, and `muted` is for a line that is context rather than a
 * figure the reader is meant to act on.
 */
export function FigureRows({
  rows,
}: {
  rows: {
    label: string;
    value: string;
    note?: string;
    strong?: boolean;
    muted?: boolean;
  }[];
}) {
  return (
    <dl className="text-sm md:text-[12.5px]">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-baseline justify-between gap-4 border-b border-[var(--color-rule-soft)] py-1.5 last:border-b-0 ${
            row.strong ? 'font-semibold' : ''
          }`}
        >
          <dt
            className={
              row.muted
                ? 'text-[var(--color-ink-3)]'
                : 'text-[var(--color-ink)]'
            }
          >
            {row.label}
            {row.note ? (
              <span className="ml-2 text-[11px] text-[var(--color-ink-3)]">
                {row.note}
              </span>
            ) : null}
          </dt>
          <dd className="figure shrink-0 tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
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

/**
 * How a figure moved against the period before it.
 *
 * `tone` is the tile's answer to "is up good here", and it has to be stated
 * rather than read off the sign. A margin rising is worth the reserved green; a
 * cost rising is not, and painting it green because the number went up is the
 * mistake that makes a dashboard lie quietly.
 *
 * `text` arrives already worked out and formatted, as every figure that reaches
 * a component does. Nothing here computes.
 */
export type StatDelta = {
  text: string;
  /** What the change is against, e.g. 'vs previous period'. */
  label?: string;
  tone: 'good-up' | 'neutral';
};

function DeltaChip({ delta }: { delta: StatDelta }) {
  const negative = delta.text.startsWith('-');
  const color =
    delta.tone === 'neutral'
      ? 'text-[var(--color-ink-3)]'
      : negative
        ? 'text-[var(--color-crit)]'
        : 'text-[var(--color-good)]';
  // The sign carries the direction. No arrow glyph and no emoji, per the house
  // style; this is a ledger, not a trading terminal.
  return (
    <span className="text-xs">
      <span className={`figure font-medium ${color}`}>{delta.text}</span>
      {delta.label ? (
        <span className="text-[var(--color-ink-3)]"> {delta.label}</span>
      ) : null}
    </span>
  );
}

export function StatTile({
  label,
  value,
  note,
  delta,
}: {
  label: string;
  value: string;
  note?: string;
  delta?: StatDelta;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-2)]">
        {label}
      </div>
      {/* A tile is the one place a figure is read on its own rather than down a
          column, and it is still a figure, so it is set in the same face. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="figure text-xl font-medium">{value}</span>
        {delta ? <DeltaChip delta={delta} /> : null}
      </div>
      {note ? (
        <div className="mt-1 text-xs text-[var(--color-ink-3)]">{note}</div>
      ) : null}
    </Card>
  );
}

/**
 * The figures that sit under the headline tiles, in one card divided into cells.
 *
 * A second row of tiles the same size as the first says the two rows matter
 * equally, which is what the dashboard used to say with seven of them. One card
 * with a rule between the cells and the figure set a step smaller reads as what
 * it is: worth having on the screen, not what the screen opens with.
 *
 * Below `sm` the cells stack and the divider turns with them, because a phone
 * has no room to put three figures side by side.
 */
export function StatStrip({
  items,
}: {
  items: { label: string; value: string; note?: string; delta?: StatDelta }[];
}) {
  return (
    <Card className="divide-y divide-[var(--color-rule-soft)] sm:flex sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="flex-1 px-4 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-2)]">
            {item.label}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span className="figure text-base font-medium">{item.value}</span>
            {item.delta ? <DeltaChip delta={item.delta} /> : null}
          </div>
          {item.note ? (
            <div className="mt-0.5 text-xs text-[var(--color-ink-3)]">
              {item.note}
            </div>
          ) : null}
        </div>
      ))}
    </Card>
  );
}
