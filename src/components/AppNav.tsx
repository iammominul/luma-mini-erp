'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/customer', label: 'Customers' },
  { href: '/subcontractor', label: 'Subcontractors' },
  { href: '/parties', label: 'Parties' },
  { href: '/backup', label: 'Backup' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
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
    <header className="bg-[var(--color-navy)] text-white print:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <span className="text-base font-semibold tracking-wide">
            {companyName}
          </span>
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-1.5 text-sm ${
                  isActive(pathname, item.href)
                    ? 'bg-white/15 font-medium'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/70">Interim Billing</span>
          <form action={signOut}>
            <button className="rounded border border-white/30 px-2.5 py-1 text-xs hover:bg-white/10">
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
