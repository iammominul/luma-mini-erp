import { OrderDocScreen } from '@/components/OrderDocScreens';

export default async function WorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDocScreen kind="wo" handle={id} />;
}
