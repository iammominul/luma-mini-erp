import { notFound, permanentRedirect } from 'next/navigation';
import { formatTaka } from '@/lib/format';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import {
  Button,
  Card,
  CardHeader,
  DownloadButton,
  LinkButton,
  StatTile,
} from '@/components/ui';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { isUuid } from '@/lib/ids';
import { findParty, listMovements } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { RecordPaymentDialog } from '@/components/RecordPaymentDialog';
import { Money } from '@/lib/money';
import { can } from '@/lib/permissions';
import { requireUser } from '@/lib/session';
import {
  buildStatement,
  closingLabel,
  formatBalance,
  statementLabels,
} from '@/lib/statement';

type Search = { from?: string; to?: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value: string | undefined): string | null =>
  value && DATE_PATTERN.test(value) ? value : null;

/**
 * The Party Ledger: a running statement, computed on read. It reads the way the
 * people who receive it expect a ledger to read, Debit and Credit with a running
 * balance carrying Dr or Cr, and the official copy is the PDF download rather
 * than a print of this screen.
 */
export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ side: string; partyId: string }>;
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const { side, partyId } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);

  const [party, filters] = await Promise.all([
    findParty(partyId),
    searchParams,
  ]);
  if (!party || !party.roles[copy.role]) notFound();

  const from = clean(filters.from);
  const to = clean(filters.to);

  // One ledger, one address. An id still resolves for the sake of links already
  // sent out, and hands the reader on to the code, keeping the period it asked
  // for so a dated statement does not silently widen to everything.
  if (isUuid(partyId) && party.code) {
    const carried = new URLSearchParams();
    if (from) carried.set('from', from);
    if (to) carried.set('to', to);
    permanentRedirect(
      `/${side}/statement/${party.code}${carried.size > 0 ? `?${carried}` : ''}`,
    );
  }

  const movements = await listMovements(party.id);
  const statement = buildStatement({
    openingBalance: party.openingBalance,
    movements,
    from,
    to,
  });
  const labels = statementLabels(copy.role);
  // What is owed in the direction this lens settles, offered as the amount on
  // Record Receipt or Record Payment. Nothing is offered when the balance
  // runs the other way, because then nothing is owed on this side.
  const owed =
    copy.paymentDirection === 'in'
      ? statement.closing.isNegative() || statement.closing.isZero()
        ? null
        : statement.closing
      : statement.closing.isNegative()
        ? Money.ZERO.subtract(statement.closing)
        : null;

  const period =
    from && to
      ? `${formatDate(from)} to ${formatDate(to)}`
      : from
        ? `From ${formatDate(from)}`
        : to
          ? `Up to ${formatDate(to)}`
          : 'All entries to date';

  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  // Links stay on the handle the URL already carries, so the address bar does
  // not change under the person using it.
  const handle = party.code ?? party.id;
  const pdfHref = `/${side}/statement/${handle}/pdf${
    query.size > 0 ? `?${query}` : ''
  }`;

  const billCount = statement.rows.filter((r) => r.kind === 'bill').length;
  const settlementCount = statement.rows.length - billCount;

  // The brought forward figure is a line of the account, not a heading above
  // it, so it goes in with the entries and the ledger stays one list.
  type LedgerRow = {
    key: string;
    date: string;
    reference: string;
    particulars: string;
    debit: string;
    credit: string;
    balance: string;
    lead: boolean;
  };

  const ledger: LedgerRow[] = [
    {
      key: 'opening',
      date: formatDate(from) || formatDate(party.openingAsOf),
      reference: '',
      particulars: labels.opening,
      debit: '',
      credit: '',
      balance: formatBalance(statement.opening),
      lead: true,
    },
    ...statement.rows.map((row) => ({
      key: `${row.kind}-${row.id}`,
      date: formatDate(row.date),
      reference: row.reference ?? '',
      particulars: row.particulars,
      debit: row.debit ? formatTaka(row.debit) : '',
      credit: row.credit ? formatTaka(row.credit) : '',
      balance: formatBalance(row.balance),
      lead: false,
    })),
  ];

  const ledgerColumns: Column<LedgerRow>[] = [
    {
      key: 'date',
      head: 'Date',
      headClassName: 'w-28',
      cellClassName: 'whitespace-nowrap',
      phone: 'meta',
      cell: (row) => row.date,
    },
    {
      key: 'reference',
      head: 'Reference',
      headClassName: 'w-32',
      cellClassName: 'text-[var(--color-muted)]',
      phone: 'meta',
      cell: (row) => row.reference,
    },
    {
      key: 'particulars',
      head: 'Particulars',
      phone: 'title',
      cell: (row) => row.particulars,
    },
    {
      key: 'debit',
      head: labels.debit,
      numeric: true,
      headClassName: 'w-32',
      cell: (row) => row.debit,
    },
    {
      key: 'credit',
      head: labels.credit,
      numeric: true,
      headClassName: 'w-32',
      cell: (row) => row.credit,
    },
    {
      // A running account is read down its balance column. On a phone there is
      // no column to read down, so the balance takes the foot of every block on
      // its own line and the eye still has one place to go.
      key: 'balance',
      head: labels.balance,
      numeric: true,
      headClassName: 'w-36',
      phone: 'full',
      phoneClassName:
        'border-t border-[var(--color-line)] pt-2 text-base font-semibold',
      cell: (row) => row.balance,
    },
  ];

  return (
    <>
      {/* The work area keeps no top padding, so a screen without a PageTitle
          sets its own. See the comment on main in AppShell.tsx. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 md:pt-5">
        <div>
          <h1 className="text-lg font-semibold">Party Ledger: {party.name}</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {copy.partyWord} | {period} | As of {formatDate(todayInDhaka())}{' '}
            (Asia/Dhaka)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton
            href={`/${side}/bills/new?party=${party.id}`}
            variant="secondary"
            icon="plus"
          >
            New {copy.billSingular}
          </LinkButton>
          {/* Recorded here in a dialog, with the party already chosen and the
              balance offered as the amount, because the statement is where
              somebody is when the cheque arrives. */}
          {can(user.role, 'settlement:manage') ? (
            <RecordPaymentDialog
              side={side}
              partyId={party.id}
              partyName={party.name}
              isReceipt={copy.paymentDirection === 'in'}
              returnTo={`/${side}/statement/${party.code ?? party.id}`}
              today={todayInDhaka()}
              suggestedAmount={owed?.toDecimalString()}
            />
          ) : null}
          <DownloadButton href={pdfHref}>Party Ledger PDF</DownloadButton>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={closingLabel(statement.closing)}
          value={formatBalance(statement.closing)}
          note={
            statement.closing.isNegative() ? 'we owe them' : 'they owe us'
          }
        />
        <StatTile
          label={labels.billed}
          value={formatTaka(statement.totalBilled)}
          note={`${billCount} ${billCount === 1 ? 'bill' : 'bills'}`}
        />
        <StatTile
          label={labels.settled}
          value={formatTaka(statement.totalSettled)}
          note={`${settlementCount} ${
            settlementCount === 1
              ? copy.settlementSingular.toLowerCase()
              : copy.settlementTitle.toLowerCase()
          }`}
        />
        <StatTile
          label={labels.opening}
          value={formatBalance(statement.opening)}
          note={
            from
              ? `carried into ${formatDate(from)}`
              : party.openingAsOf
                ? `as of ${formatDate(party.openingAsOf)}`
                : 'brought forward'
          }
        />
      </div>

      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ''}
              className="min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base sm:w-auto md:min-h-0 md:px-2.5 md:py-1.5 md:text-sm"
            />
          </label>
          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ''}
              className="min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base sm:w-auto md:min-h-0 md:px-2.5 md:py-1.5 md:text-sm"
            />
          </label>
          <Button size="filter" block>
            Apply
          </Button>
          <LinkButton
            href={`/${side}/statement/${handle}`}
            variant="secondary"
            size="filter"
            block
          >
            All Entries
          </LinkButton>
        </form>
      </Card>

      <Card>
        <CardHeader title="Ledger Account" />
        <DataTable
          columns={ledgerColumns}
          rows={ledger}
          rowKey={(row) => row.key}
          rowClassName={(row) => (row.lead ? 'font-medium' : '')}
          total={{
            label: 'Total',
            cells: {
              debit: formatTaka(statement.totalDebit),
              credit: formatTaka(statement.totalCredit),
              balance: formatBalance(statement.closing),
            },
          }}
        />
        {statement.rows.length === 0 ? (
          <p className="border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]">
            No entries in this period. The balance above is the one brought
            forward.
          </p>
        ) : null}
        {statement.closing.isNegative() ? (
          <p className="border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]">
            This closing balance is an advance held{' '}
            {copy.role === 'customer'
              ? 'from the customer'
              : `with the ${copy.partyWord.toLowerCase()}`}
            .
          </p>
        ) : null}
      </Card>
    </>
  );
}
