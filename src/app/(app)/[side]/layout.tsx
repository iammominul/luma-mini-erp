import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isSide } from '@/lib/side';

/**
 * Guards the side segment so a bad URL is a 404 rather than a crash deeper in.
 * Navigation between the two sides is in the left sidebar, which lists both, so
 * there is no tab strip here.
 */
export default async function SideLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ side: string }>;
}) {
  const { side } = await params;
  if (!isSide(side)) notFound();
  return <>{children}</>;
}
