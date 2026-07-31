'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The left sidebar, following the approved ERP prototype: brand block at the top,
 * modules grouped by domain, one navy column. The domains are named the way the
 * ERP names them, so someone who learns this app already knows where things are
 * when the full ERP takes over.
 */

type NavItem = { href: string; label: string; exact?: boolean };
type NavGroup = { domain: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    domain: 'Dashboard',
    items: [{ href: '/', label: 'Dashboard', exact: true }],
  },
  {
    domain: 'Customers',
    items: [
      { href: '/customer', label: 'Overview', exact: true },
      { href: '/customer/bills', label: 'Customer Bills' },
      { href: '/customer/settlements', label: 'Money Receipts' },
      { href: '/customer/statement', label: 'Party Ledger' },
    ],
  },
  {
    domain: 'Subcontractors',
    items: [
      { href: '/subcontractor', label: 'Overview', exact: true },
      { href: '/subcontractor/bills', label: 'Bills Received' },
      { href: '/subcontractor/settlements', label: 'Payments' },
      { href: '/subcontractor/statement', label: 'Party Ledger' },
    ],
  },
  {
    domain: 'Administration',
    items: [
      { href: '/parties', label: 'Parties' },
      { href: '/backup', label: 'Backup' },
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function AppNav({
  companyName,
  signOut,
}: {
  companyName: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-[var(--color-navy)] text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="text-sm font-semibold tracking-wide">{companyName}</div>
        <div className="mt-0.5 text-xs text-white/55">Interim Billing</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3" aria-label="Modules">
        {GROUPS.map((group) => (
          <div key={group.domain} className="mb-3">
            <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {group.domain}
            </div>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block border-l-2 px-4 py-1.5 text-sm ${
                  isActive(pathname, item)
                    ? 'border-white bg-[var(--color-navy-600)] font-medium text-white'
                    : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <form action={signOut} className="border-t border-white/10 px-4 py-3">
        <button className="w-full rounded border border-white/25 px-2.5 py-1.5 text-xs hover:bg-white/10">
          Sign Out
        </button>
      </form>
    </aside>
  );
}
