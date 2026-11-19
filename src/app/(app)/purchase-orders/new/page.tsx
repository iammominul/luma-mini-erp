import { OrderDocNewScreen } from '@/components/OrderDocScreens';

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  return <OrderDocNewScreen kind="po" orderHandle={order} />;
}
