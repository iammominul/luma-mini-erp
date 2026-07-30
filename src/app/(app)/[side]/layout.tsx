import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SideNav } from '@/components/SideNav';
import { copyFor, isSide } from '@/lib/side';

export default async function SideLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ side: string }>;
}) {
  const { side } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);

  return (
    <>
      <SideNav
        items={[
          { href: `/${side}`, label: 'Outstanding', exact: true },
          { href: `/${side}/bills`, label: copy.billTitle },
          { href: `/${side}/settlements`, label: copy.settlementTitle },
          { href: `/${side}/statement`, label: 'Statements' },
        ]}
      />
      {children}
    </>
  );
}
