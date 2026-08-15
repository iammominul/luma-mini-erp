/**
 * The marks on the navigation rail.
 *
 * Taken from the approved prototype, `docs/prototype/v5` in the planning
 * repository, and drawn on its grid: 16 units, no fill, 1.4 stroke, round caps
 * and joins, everything inheriting currentColor. They were on a 24 unit grid at
 * a 1.6 stroke before, which is a visibly lighter line than the prototype's,
 * and a mark redrawn at another weight is a different mark.
 *
 * Six are the prototype's own paths, unchanged, for the groups it also has:
 * dashboard, money, books, parties, reports and administration. The rest are
 * drawn here to the same rules, because this app has screens the full ERP does
 * not: HR, payroll, and the shortcuts block.
 *
 * They are plain line icons on purpose: this is classic office software, so no
 * emoji, no filled glyphs and no color of their own. Drawn here rather than
 * pulled from a package, because the rail needs about sixteen of them and a
 * dependency for that is not worth the weight in an app that gets archived.
 */

export type NavIconName =
  | 'dashboard'
  | 'receivable'
  | 'payable'
  | 'books'
  | 'people'
  | 'parties'
  | 'admin'
  | 'reports'
  | 'chevron'
  | 'caret'
  | 'collapse'
  | 'expand'
  | 'menu'
  | 'close'
  | 'recent'
  | 'signout';

const PATHS: Record<NavIconName, React.ReactNode> = {
  // Four panes, the shape a dashboard has had since before the web.
  dashboard: (
    <>
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </>
  ),
  // The two sides of the book, drawn as one pair so they read against each
  // other: money into the tray, money out of it. A direction is the only thing
  // that separates a bill raised from a bill received, and it is the thing the
  // mark has to carry. The prototype has a single document for its one Money
  // group, which cannot say which way a screen points.
  receivable: (
    <>
      <path d="M8 2v6.6" />
      <path d="M5.3 5.9 8 8.6l2.7-2.7" />
      <path d="M2.3 10.9h11.4v3.1H2.3z" />
    </>
  ),
  payable: (
    <>
      <path d="M8 8.6V2" />
      <path d="M5.3 4.7 8 2l2.7 2.7" />
      <path d="M2.3 10.9h11.4v3.1H2.3z" />
    </>
  ),
  // An open book: the ledgers, where a statement is read off two facing sides.
  books: (
    <>
      <path d="M8 4.3S6.4 3.1 3.6 3.1H2.2v9h1.4C6.4 12.1 8 13.3 8 13.3" />
      <path d="M8 4.3s1.6-1.2 4.4-1.2h1.4v9h-1.4c-2.8 0-4.4 1.2-4.4 1.2" />
      <path d="M8 4.3v9" />
    </>
  ),
  // A card index: the master records the rest of the book points at.
  parties: (
    <>
      <path d="M2.5 3.5h11v9h-11z" />
      <path d="M6.2 6.6h5M6.2 9.6h5" />
      <circle cx="4.2" cy="6.6" r=".85" />
      <circle cx="4.2" cy="9.6" r=".85" />
    </>
  ),
  // Bars on an axis. A report is read as a shape before it is read as figures.
  reports: (
    <>
      <path d="M2.5 13.4h11" />
      <path d="M4.6 13.4V8.2M8 13.4V4.4M11.4 13.4V9.9" />
    </>
  ),
  // Sliders, the settings mark, kept away from a gear so it reads at 16px.
  admin: (
    <>
      <path d="M2.5 5.2h6.4M12.6 5.2h.9M2.5 10.8h2.4M8.6 10.8h4.9" />
      <circle cx="10.6" cy="5.2" r="1.7" />
      <circle cx="6.6" cy="10.8" r="1.7" />
    </>
  ),
  // A person and their file. HR keeps the personnel record, not the money.
  people: (
    <>
      <path d="M2.2 3h11.6v10H2.2z" />
      <circle cx="6" cy="6.6" r="1.6" />
      <path d="M3.6 11.2a2.6 2.6 0 0 1 4.8 0" />
      <path d="M10.4 6.3h2.2M10.4 9h2.2" />
    </>
  ),
  chevron: <path d="M6 3.5 10.5 8 6 12.5" />,
  // The same hint turned down, for a control that opens a panel below itself
  // rather than a group beside it.
  caret: <path d="M3.5 6 8 10.5 12.5 6" />,
  // A panel with the rail closing to the left.
  collapse: (
    <>
      <rect x="2" y="2.6" width="12" height="10.8" rx="1" />
      <path d="M6 2.6v10.8" />
      <path d="M11 6.2 9.2 8l1.8 1.8" />
    </>
  ),
  expand: (
    <>
      <rect x="2" y="2.6" width="12" height="10.8" rx="1" />
      <path d="M6 2.6v10.8" />
      <path d="M9.2 6.2 11 8l-1.8 1.8" />
    </>
  ),
  // Three rules: the mark that opens the menu on a phone.
  menu: <path d="M2.5 4.4h11M2.5 8h11M2.5 11.6h11" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  // A clock turned back: what changed lately, not a bell. There is nothing to
  // be notified of here, only a log to look at.
  recent: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 4.6V8l2.4 1.4" />
    </>
  ),
  signout: (
    <>
      <path d="M9.2 2.6H4.3a1 1 0 0 0-1 1v8.8a1 1 0 0 0 1 1h4.9" />
      <path d="M11.2 5.6 13.6 8l-2.4 2.4" />
      <path d="M13.2 8H7.4" />
    </>
  ),
};

export function NavIcon({
  name,
  className = '',
}: {
  name: NavIconName;
  className?: string;
}) {
  // Chevron and caret are hints rather than labels, so they are drawn smaller
  // and heavier than the rest, which is what keeps them legible at that size.
  const small = name === 'chevron' || name === 'caret';
  return (
    <svg
      viewBox="0 0 16 16"
      width={small ? 10 : 16}
      height={small ? 10 : 16}
      fill="none"
      stroke="currentColor"
      strokeWidth={small ? 2 : 1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
