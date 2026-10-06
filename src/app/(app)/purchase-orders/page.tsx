import { OrderDocListScreen } from '@/components/OrderDocScreens';

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ party?: string; status?: string }>;
}) {
  return <OrderDocListScreen kind="po" filters={await searchParams} />;
}
