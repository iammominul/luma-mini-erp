import { OrderDocNewScreen } from '@/components/OrderDocScreens';

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  return <OrderDocNewScreen kind="wo" orderHandle={order} />;
}
