import { OrderDocListScreen } from '@/components/OrderDocScreens';

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ party?: string; status?: string }>;
}) {
  return <OrderDocListScreen kind="wo" filters={await searchParams} />;
}
