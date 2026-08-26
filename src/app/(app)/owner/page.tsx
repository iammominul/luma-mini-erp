import { MoneyEntryForm } from '@/components/MoneyEntryForm';
import {
  Card,
  CardHeader,
  EmptyRow,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { listOwnerMovements, ownerTotals } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { fundCategoryLabel, paymentModeLabel } from '@/lib/types';
import { recordCapitalAction, recordDrawingAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The owner's own account: what has gone in, what has come out, what stands.
 *
 * There is one owner, so nothing here asks whose money it is. Neither entry
 * needs a master record, a picker or a second screen, which is the whole point:
 * recording a drawing is four fields and one save.
 *
 * Neither figure is a cost. Money the owner puts in is not revenue and money
 * taken out is not an expense, so nothing on this screen reaches the profit
 * statement. Both move cash, so both are in the Cash Book.
 */
export default async function OwnerPage() {
  await requirePermission('fund:read');
  const today = todayInDhaka();

  const [totals, movements] = await Promise.all([
    ownerTotals(),
    listOwnerMovements(),
  ]);

  return (
    <>
      <PageTitle title="Owner's Account" />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Capital Introduced"
          value={formatTaka(totals.introduced)}
        />
        <StatTile label="Drawings" value={formatTaka(totals.drawn)} />
        <StatTile
          label="Standing"
          value={formatTaka(totals.standing)}
          note="Introduced less drawn"
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Record Capital" />
          <div className="p-4 pt-3">
            <MoneyEntryForm
              action={recordCapitalAction}
              submitLabel="Save Capital"
              today={today}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Record Drawing" />
          <div className="p-4 pt-3">
            <MoneyEntryForm
              action={recordDrawingAction}
              submitLabel="Save Drawing"
              today={today}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Entries"
          action={
            <span className="text-sm text-[var(--color-muted)]">
              {movements.length}{' '}
              {movements.length === 1 ? 'entry' : 'entries'}
            </span>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Voucher</Th>
              <Th>Entry</Th>
              <Th>Method</Th>
              <Th>Note</Th>
              <Th numeric>In</Th>
              <Th numeric>Out</Th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 ? (
              <EmptyRow columns={7}>Nothing recorded yet</EmptyRow>
            ) : (
              movements.map((movement) => (
                <tr key={movement.id}>
                  <Td className="whitespace-nowrap">
                    {formatDate(movement.movedOn)}
                  </Td>
                  <Td className="whitespace-nowrap">{movement.docNo ?? ''}</Td>
                  <Td>{fundCategoryLabel(movement.category)}</Td>
                  <Td className="whitespace-nowrap text-[var(--color-muted)]">
                    {paymentModeLabel(movement.mode)}
                  </Td>
                  <Td>{movement.notes ?? ''}</Td>
                  <Td numeric>
                    {movement.direction === 'in'
                      ? formatTaka(movement.amount)
                      : ''}
                  </Td>
                  <Td numeric>
                    {movement.direction === 'out'
                      ? formatTaka(movement.amount)
                      : ''}
                  </Td>
                </tr>
              ))
            )}
            {movements.length > 0 ? (
              <tr className="font-semibold">
                <Td colSpan={5}>Standing {formatTaka(totals.standing)}</Td>
                <Td numeric>{formatTaka(totals.introduced)}</Td>
                <Td numeric>{formatTaka(totals.drawn)}</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
