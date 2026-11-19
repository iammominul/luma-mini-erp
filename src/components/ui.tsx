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
  primary:
    'bg-navy text-white shadow-[0_1px_2px_rgb(16_24_40/0.12)] hover:bg-navy-600',
  secondary:
    'bg-white text-ink border border-rule shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:bg-surface-2 hover:border-rule-strong',
  danger:
    'bg-white text-crit border border-crit/30 shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:bg-crit/5',
};

// 44px is the smallest a control should be to be tapped reliably. Written once
// because a button, a download and a cancel link all have to agree on it.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  default:
    'min-h-11 px-4 py-2.5 text-sm md:min-h-0 md:h-[26px] md:px-2.5 md:py-0 md:text-meta',
  filter: 'min-h-11 px-4 py-2.5 text-sm md:min-h-0 md:px-3 md:py-1.5',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-control font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-navy/20';

/** Full width on a phone, its own width from `sm` up. */
const BLOCK = 'w-full sm:w-auto';

/**
 * The mark on a button, sized down at `md` because the button itself drops to
 * 26px with a 12px label there and a full 16px glyph beside that reads as an
 * icon with a word stuck to it.
 */
export function ButtonIcon({ name }: { name: IconName }) {
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

/**
 * A button's classes, for an element that has to look like one and cannot be
 * one of the components here: the `summary` of a disclosure, which must be a
 * summary to open its details.
 */
export function look({
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
      className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-rule bg-white text-ink-2 hover:border-rule-strong hover:bg-surface-2 hover:text-navy md:h-7 md:w-7"
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
  'w-full rounded-control border border-rule bg-white px-3 py-2.5 text-base shadow-[0_1px_2px_rgb(16_24_40/0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-ink-3 hover:border-rule-strong focus:border-navy focus:ring-3 focus:ring-navy/15 md:px-2 md:py-1 md:text-body';

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
        <span className="mt-1 block text-xs text-ink-3">
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
      className={`card ${className}`}
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-soft px-4 py-2.5 md:py-2">
      <h2 className="text-heading font-semibold">{title}</h2>
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
    <div className="mb-4 border-b border-rule bg-surface-2 pb-2.5 md:sticky md:top-0 md:z-20 md:pb-2 md:pt-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="min-w-0">
          <Crumb />
          <h1 className="text-title font-semibold tracking-[-0.015em] text-ink">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-ink-3 md:text-meta">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 lg:shrink-0 lg:justify-end">
          {asOf ? (
            <span className="hidden self-center text-meta text-ink-3 sm:block">
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
 * The head of one record: a bill, a receipt, an order, a PO or WO.
 *
 * Every record view had built its own: a Back button on a row of its own, an
 * h1, and the facts run together in one gray line with pipes between them, so
 * the date, the party and the paper number all read as one string. This is
 * the one shape for all of them, the way an ERP's object page is laid out:
 *
 *   Customer Bills                                      (the way back)
 *   CUSTOMER BILL                                       (what it is)
 *   CB-26-0113  [Posted]               [Record Receipt] [PDF] [Edit] ...
 *   Party Rongdhonu Fabrics   Date 02 Oct 2026   Paper Ref 4471
 *   [stage bar, for a record that moves through stages]
 *   [the key figures, one strip]
 *
 * The number is the largest text on the screen, because it is what somebody
 * reads aloud on the phone and what is printed on the paper in their hand.
 * Facts are label and value, so each one can be found by its label.
 */
export function RecordHead({
  back,
  kind,
  number,
  tags,
  facts,
  actions,
  stages,
  figures,
}: {
  back: { href: string; label: string };
  /** What the record is: Customer Bill, Money Receipt, Sales Order. */
  kind: string;
  /** Its number, or a stand-in such as Draft for one not yet numbered. */
  number: string;
  tags?: ReactNode;
  facts: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  stages?: { steps: string[]; current: number; void?: string };
  figures?: { label: string; value: string; strong?: boolean }[];
}) {
  return (
    <div className="mb-4 md:pt-4">
      <Link
        href={back.href}
        className="link inline-flex min-h-11 items-center gap-1 text-meta md:min-h-0"
      >
        <ButtonIcon name="back" />
        {back.label}
      </Link>

      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="eyebrow">{kind}</div>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="figure text-number font-semibold text-ink">
              {number}
            </span>
            {tags}
          </h1>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-body">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-baseline gap-1.5">
            <dt className="text-ink-3">{fact.label}</dt>
            <dd className="font-medium text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {stages ? <StageBar {...stages} /> : null}

      {figures && figures.length > 0 ? (
        <div className="card mt-4 grid grid-cols-2 overflow-hidden sm:flex">
          {figures.map((figure) => (
            <div
              key={figure.label}
              className="border-b border-r border-rule-soft px-4 py-2 sm:flex-1 sm:border-b-0 sm:last:border-r-0"
            >
              <div className="eyebrow">{figure.label}</div>
              <div
                className={`figure mt-0.5 text-heading ${
                  figure.strong ? 'font-semibold' : 'font-medium'
                }`}
              >
                {figure.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The documents a record is tied to, as a run of plain links: the trail from
 * a bill back to its Sales Order and the Work Order it came through. Given to
 * RecordHead as the value of a fact, so the trail reads as one more labeled
 * detail of the record rather than as a widget of its own. Plain links, not
 * chips: a row of pill chips is the generated-dashboard look.
 */
export function DocLinks({
  links,
}: {
  links: { text: string; href: string }[];
}) {
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {links.map((link, index) => (
        <span key={link.href}>
          <Link href={link.href} className="link font-medium">
            {link.text}
          </Link>
          {index < links.length - 1 ? ',' : ''}
        </span>
      ))}
    </span>
  );
}

/**
 * How far a record has come, as a row of steps: done, the current one, still
 * to come. The step is read off the documents and passed in; nothing here
 * decides it. A record that has left the path, a cancelled order, shows the
 * path greyed with its state named beside it, rather than a step it never
 * reached.
 */
export function StageBar({
  steps,
  current,
  void: voided,
}: {
  steps: string[];
  current: number;
  void?: string;
}) {
  return (
    <ol
      aria-label="Stage"
      className="mt-3 flex flex-wrap items-center gap-y-1 text-meta"
    >
      {steps.map((step, index) => {
        const state = voided
          ? 'void'
          : index < current
            ? 'done'
            : index === current
              ? 'current'
              : 'todo';
        return (
          <li key={step} className="flex items-center">
            {index > 0 ? (
              <span
                aria-hidden
                className={`mx-1.5 h-px w-5 ${
                  state === 'done' || state === 'current'
                    ? 'bg-navy'
                    : 'bg-rule'
                }`}
              />
            ) : null}
            <span
              aria-current={state === 'current' ? 'step' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${
                state === 'current'
                  ? 'bg-navy font-semibold text-white'
                  : state === 'done'
                    ? 'text-navy'
                    : 'text-ink-3'
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  state === 'current'
                    ? 'bg-white'
                    : state === 'done'
                      ? 'bg-navy'
                      : 'border border-rule bg-white'
                }`}
              />
              {step}
            </span>
          </li>
        );
      })}
      {voided ? (
        <li className="ml-3">
          <Tag tone="crit">{voided}</Tag>
        </li>
      ) : null}
    </ol>
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
      className={`pt-6 ${className}`}
    >
      {title ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="eyebrow">
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
    <dl className="text-sm md:text-body">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-baseline justify-between gap-4 border-b border-rule-soft py-1.5 last:border-b-0 ${
            row.strong ? 'font-semibold' : ''
          }`}
        >
          <dt
            className={
              row.muted
                ? 'text-ink-3'
                : 'text-ink'
            }
          >
            {row.label}
            {row.note ? (
              <span className="ml-2 text-caption text-ink-3">
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
      <table className="w-full border-collapse text-sm md:text-body">
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
      className={`sticky top-0 z-10 whitespace-nowrap border-b border-rule bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.05em] text-ink-2 md:h-[26px] md:px-[9px] md:py-0 md:text-caption ${
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
      className={`border-b border-rule-soft px-3 py-2 align-middle md:h-(--row) md:px-[9px] md:py-1 ${
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
      <Td colSpan={columns} className="text-center text-ink-3">
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
      'border-crit/40 bg-crit/5 text-crit',
    warning:
      'border-warn/40 bg-warn/5 text-warn',
    info: 'border-rule bg-white text-ink',
  };
  return (
    <div
      className={`rounded-control border px-3.5 py-2.5 text-sm md:text-body ${TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The state a record is in, as a small bordered mark: Draft, Posted, Open,
 * Closed, Cancelled, Paid, Inactive.
 *
 * Seven screens had drawn this seven ways, from plain gray text to a green
 * pill, so the same idea read differently on each. There is now one mark and
 * five tones, and the tone says what the reader should do about it, not what
 * the word is:
 *
 *   neutral  in progress, nothing to do         Open, Booked, In Dyeing
 *   active   in progress and in someone's hands  Draft, Approved
 *   done     finished, out of the way            Posted, Paid, Closed, Settled
 *   warn     needs a person to act               Needs Detail
 *   crit     refused or void                     Cancelled, Disabled
 *
 * `good` is deliberately not a tone. A Paid run is not an achievement on an
 * accounts screen, it is the ordinary end of a month, and painting every
 * finished row green leaves no color for the row that is actually wrong.
 */
export type TagTone = 'neutral' | 'active' | 'done' | 'warn' | 'crit';

const TAG_TONES: Record<TagTone, string> = {
  neutral: 'border-rule bg-white text-ink',
  active:
    'border-navy/35 bg-navy/[0.06] text-navy',
  done: 'border-rule-soft bg-surface-2 text-ink-3',
  warn: 'border-warn/35 bg-warn/[0.06] text-warn',
  crit: 'border-crit/35 bg-crit/[0.06] text-crit',
};

export function Tag({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-caption font-medium ${TAG_TONES[tone]} ${className}`}
    >
      {children}
    </span>
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
      ? 'text-ink-3'
      : negative
        ? 'text-crit'
        : 'text-good';
  // The sign carries the direction. No arrow glyph and no emoji, per the house
  // style; this is a ledger, not a trading terminal.
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`figure rounded-md px-1.5 py-px font-semibold ${color} ${
          delta.tone === 'neutral'
            ? 'bg-surface-3'
            : negative
              ? 'bg-crit/[0.07]'
              : 'bg-good/[0.08]'
        }`}
      >
        {delta.text}
      </span>
      {delta.label ? <span className="text-ink-3">{delta.label}</span> : null}
    </span>
  );
}

export function StatTile({
  label,
  value,
  note,
  delta,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  delta?: StatDelta;
  /** The screen that explains the figure. The whole tile is the link. */
  href?: string;
}) {
  const body = (
    <>
      {/* No icon in a tinted square beside the label: that is the stock
          generated-dashboard tile, and the label already says what it is. */}
      <div className="eyebrow-strong">{label}</div>
      {/* A tile is the one place a figure is read on its own rather than down a
          column, and it is still a figure, so it is set in the same face. */}
      <div className="figure mt-1.5 text-number font-semibold tracking-[-0.01em] text-ink">
        {value}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
        {delta ? <DeltaChip delta={delta} /> : null}
        {note ? <span className="text-ink-3">{note}</span> : null}
      </div>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="card block border-t-[3px] border-t-navy px-4 py-3 transition-[border-color] hover:border-rule-strong hover:border-t-navy"
    >
      {body}
    </Link>
  ) : (
    <div className="card border-t-[3px] border-t-navy px-4 py-3">{body}</div>
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
    <Card className="divide-y divide-rule-soft sm:flex sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="flex-1 px-4 py-2.5">
          <div className="eyebrow-strong">
            {item.label}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span className="figure text-base font-medium">{item.value}</span>
            {item.delta ? <DeltaChip delta={item.delta} /> : null}
          </div>
          {item.note ? (
            <div className="mt-0.5 text-xs text-ink-3">
              {item.note}
            </div>
          ) : null}
        </div>
      ))}
    </Card>
  );
}
