import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/**
 * The same hand-rolled primitives the real ERP frontend uses: classic office
 * software, dense bordered tables, one navy accent.
 */

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy-600)]',
  secondary:
    'bg-white text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-gray-50',
  danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
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
    <a
      href={href}
      className={`inline-flex items-center justify-center rounded px-3 py-1.5 text-sm font-medium transition-colors ${BUTTON_STYLES[variant]}`}
    >
      {children}
    </a>
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
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--color-line)] bg-white text-[var(--color-navy)] hover:bg-gray-50"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 2v8" />
        <path d="M4.5 7 8 10.5 11.5 7" />
        <path d="M2.5 13.5h11" />
      </svg>
    </a>
  );
}

const CONTROL =
  'w-full rounded border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-navy)] focus:ring-1 focus:ring-[var(--color-navy)]';

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Select({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
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
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded border border-[var(--color-line)] bg-white ${className}`}
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
    <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
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
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  numeric = false,
  className = '',
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] ${
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
      className={`border-b border-[var(--color-line)] px-3 py-2 align-top ${
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
}: {
  children: ReactNode;
  tone?: 'info' | 'error';
}) {
  const styles =
    tone === 'error'
      ? 'border-red-300 bg-red-50 text-red-800'
      : 'border-[var(--color-line)] bg-white text-[var(--color-ink)]';
  return (
    <div className={`rounded border px-3 py-2 text-sm ${styles}`}>
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
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {note ? (
        <div className="mt-0.5 text-xs text-[var(--color-muted)]">{note}</div>
      ) : null}
    </Card>
  );
}
