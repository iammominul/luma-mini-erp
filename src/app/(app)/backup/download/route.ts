import { NextResponse, type NextRequest } from 'next/server';
import { todayInDhaka } from '@/lib/dates';
import {
  billsCsv,
  exportEverything,
  partiesCsv,
  paymentsCsv,
} from '@/lib/export';

export const dynamic = 'force-dynamic';

/**
 * Downloads for the weekly backup. The JSON file is the complete book and the
 * one to keep; the CSV files are for reading in a spreadsheet.
 */
export async function GET(request: NextRequest) {
  const set = request.nextUrl.searchParams.get('set') ?? 'all';
  const bundle = await exportEverything();
  const stamp = todayInDhaka();

  const file = (
    body: string,
    name: string,
    type: string,
  ): NextResponse<string> =>
    new NextResponse(body, {
      headers: {
        'Content-Type': `${type}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });

  switch (set) {
    case 'bills':
      return file(billsCsv(bundle), `bills-${stamp}.csv`, 'text/csv');
    case 'payments':
      return file(
        paymentsCsv(bundle),
        `receipts-payments-${stamp}.csv`,
        'text/csv',
      );
    case 'parties':
      return file(partiesCsv(bundle), `parties-${stamp}.csv`, 'text/csv');
    default:
      return file(
        JSON.stringify(bundle, null, 2),
        `interim-billing-backup-${stamp}.json`,
        'application/json',
      );
  }
}
