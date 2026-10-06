import { OrderDocEditScreen } from '@/components/OrderDocScreens';

export default async function EditWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDocEditScreen kind="wo" handle={id} />;
}
