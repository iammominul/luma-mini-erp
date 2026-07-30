'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SideNavItem = { href: string; label: string; exact?: boolean };

export function SideNav({ items }: { items: SideNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex gap-1 border-b border-[var(--color-line)] print:hidden">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active
                ? 'border-[var(--color-navy)] font-medium text-[var(--color-navy)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
