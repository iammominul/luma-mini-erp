import { OrderDocScreen } from '@/components/OrderDocScreens';

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDocScreen kind="po" handle={id} />;
}
