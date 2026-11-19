import { OrderDocEditScreen } from '@/components/OrderDocScreens';

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDocEditScreen kind="po" handle={id} />;
}
