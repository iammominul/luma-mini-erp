import { Card, CardHeader, Table, Td, Th } from './ui';
import type { ProfitStatement } from '@/lib/costing';
import { formatTaka } from '@/lib/format';
import type { Money } from '@/lib/money';

/**
 * The trading result, read the way a profit and loss statement is read: down
 * the page, each figure under the one it came out of.
 *
 * A table rather than a chart on purpose. Figures that subtract from each other
 * in order are a statement, and drawing them as bars would say less than the
 * words do while inviting somebody to compare a cost against a margin by eye.
 *
 * Three tiers, and the order matters. Gross margin is kept clear of commission
 * because commission varies with revenue but says nothing about whether the
 * dyeing was bought well, and mixing the two hides the number that tells you
 * how the trade itself is doing.
 *
 * The basis is printed under it rather than assumed. This is not an accounting
 * profit.
 */
export function TradingSummary({
  result,
  rangeLabel,
}: {
  result: ProfitStatement;
  rangeLabel: string;
}) {
  return (
    <Card>
      <CardHeader title="Profit Statement" />
      <Table>
        <thead>
          <tr>
            <Th>{rangeLabel}</Th>
            <Th numeric>Amount (Tk)</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>Billed to Customers</Td>
            <Td numeric>{formatTaka(result.revenue)}</Td>
          </tr>

          {result.directLines.map((line) => (
            <tr key={line.label}>
              <Td className="pl-6 text-[var(--color-muted)]">
                Less: {line.label}
              </Td>
              <Td numeric>({formatTaka(line.amount)})</Td>
            </tr>
          ))}
          <Subtotal
            label="Gross Margin"
            amount={result.grossMargin}
            share={result.grossMarginPercent}
          />

          {result.sellingLines.map((line) => (
            <tr key={line.label}>
              <Td className="pl-6 text-[var(--color-muted)]">
                Less: {line.label}
              </Td>
              <Td numeric>({formatTaka(line.amount)})</Td>
            </tr>
          ))}
          <Subtotal
            label="Contribution"
            amount={result.contribution}
            share={result.contributionPercent}
          />

          {result.operatingLines.map((line) => (
            <tr key={line.label}>
              <Td className="pl-6 text-[var(--color-muted)]">
                Less: {line.label}
              </Td>
              <Td numeric>({formatTaka(line.amount)})</Td>
            </tr>
          ))}
          <Subtotal
            label={result.netResult.isNegative() ? 'Net Loss' : 'Net Result'}
            amount={result.netResult}
            share={result.netResultPercent}
            strong
          />
        </tbody>
      </Table>

      <div className="border-t border-[var(--color-line)] px-4 py-3 text-xs text-[var(--color-muted)]">
        Bills count in the month they are raised; expenses, salary and
        reimbursed claims count when they are paid. A customer bill and the
        subcontract bill behind it can fall in different months, so a single
        month moves around while a longer period settles. Margin per customer is
        not shown, because nothing links a customer bill to the subcontract bill
        for the same goods. For margin per order, see Order Costing.
      </div>
    </Card>
  );
}

function Subtotal({
  label,
  amount,
  share,
  strong = false,
}: {
  label: string;
  amount: Money;
  share: string | null;
  strong?: boolean;
}) {
  const negative = amount.isNegative();
  return (
    <tr
      className={`border-t border-[var(--color-line)] font-semibold ${
        strong ? 'bg-[var(--color-canvas)]' : ''
      }`}
    >
      <Td>
        {label}
        {share ? (
          <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
            {share} of billing
          </span>
        ) : null}
      </Td>
      <Td numeric className={negative ? 'text-red-700' : undefined}>
        {formatTaka(amount)}
      </Td>
    </tr>
  );
}
