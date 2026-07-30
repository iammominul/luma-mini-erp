import { Card, CardHeader, PageTitle } from '@/components/ui';
import { exportEverything } from '@/lib/export';

const LINK =
  'rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50';

export default async function BackupPage() {
  const bundle = await exportEverything();

  return (
    <>
      <PageTitle
        title="Backup and Export"
        subtitle="Take a copy of the book. The JSON file is what the full ERP will read when it takes over."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Parties
          </div>
          <div className="mt-1 text-xl font-semibold">
            {bundle.parties.length}
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Bills
          </div>
          <div className="mt-1 text-xl font-semibold">
            {bundle.bills.length}
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Receipts and Payments
          </div>
          <div className="mt-1 text-xl font-semibold">
            {bundle.payments.length}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Downloads" />
        <div className="space-y-4 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <a className={LINK} href="/backup/download?set=all">
              Full Backup (JSON)
            </a>
            <a className={LINK} href="/backup/download?set=bills">
              Bills (CSV)
            </a>
            <a className={LINK} href="/backup/download?set=payments">
              Receipts and Payments (CSV)
            </a>
            <a className={LINK} href="/backup/download?set=parties">
              Parties (CSV)
            </a>
          </div>

          <div className="text-[var(--color-muted)]">
            <p>
              Neon keeps its own point-in-time backups, so this is a second copy
              you hold yourself. Take the JSON file once a week and keep it off
              the server.
            </p>
            <p className="mt-2">
              Every amount is exported as text, not as a number, so nothing gets
              rounded on the way out. The CSV files open in Excel; the JSON file
              is the complete record, including the activity log.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
