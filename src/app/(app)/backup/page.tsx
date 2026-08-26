import { Card, CardHeader, DownloadButton, PageTitle } from '@/components/ui';
import { exportEverything } from '@/lib/export';

export default async function BackupPage() {
  const bundle = await exportEverything();

  return (
    <>
      <PageTitle title="Backup and Export" />

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
            <DownloadButton variant="secondary" href="/backup/download?set=all">
              Full Backup (JSON)
            </DownloadButton>
            <DownloadButton
              variant="secondary"
              href="/backup/download?set=bills"
            >
              Bills (CSV)
            </DownloadButton>
            <DownloadButton
              variant="secondary"
              href="/backup/download?set=payments"
            >
              Receipts and Payments (CSV)
            </DownloadButton>
            <DownloadButton
              variant="secondary"
              href="/backup/download?set=parties"
            >
              Parties (CSV)
            </DownloadButton>
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
