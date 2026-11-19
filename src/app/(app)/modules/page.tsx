import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Button, Card, Notice, PageTitle, Select, Tag } from '@/components/ui';
import {
  AUDIENCES,
  MODULES,
  audienceLabel,
  placeLabel,
  type Audience,
  type ModuleInfo,
} from '@/lib/modules';
import { listModuleSwitches } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { setModuleSwitchAction } from './actions';

/**
 * The full ERP's 22 modules as this app carries them: where each runs, the wave
 * that builds it, and who is offered it. Owner only.
 *
 * A planned module shows its wave and has no switch, because there is nothing
 * yet to offer anybody.
 */

type Row = ModuleInfo & { audience: Audience };

const columns: Column<Row>[] = [
  { key: 'code', head: 'Code', cellClassName: 'font-medium', cell: (m) => m.code },
  {
    key: 'name',
    head: 'Module',
    phone: 'title',
    cell: (m) => (
      <>
        {m.name}
        {m.note ? <span className="block text-xs text-ink-3">{m.note}</span> : null}
      </>
    ),
  },
  { key: 'place', head: 'Runs', phone: 'meta', cell: (m) => placeLabel(m.place) },
  { key: 'wave', head: 'Wave', cell: (m) => (m.wave === null ? '' : String(m.wave)) },
  {
    key: 'audience',
    head: 'Offered To',
    cell: (m) =>
      m.built ? (
        <form action={setModuleSwitchAction} className="flex items-center gap-2">
          <input type="hidden" name="module" value={m.code} />
          <Select name="audience" defaultValue={m.audience} aria-label={`Who sees ${m.name}`}>
            {AUDIENCES.map((audience) => (
              <option key={audience} value={audience}>
                {audienceLabel(audience)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Save
          </Button>
        </form>
      ) : m.place === 'here' ? (
        <Tag tone="done">Always On</Tag>
      ) : (
        <Tag>Planned</Tag>
      ),
  },
];

export default async function ModulesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission('module:manage');
  const { error } = await searchParams;
  const switches = await listModuleSwitches();
  const rows: Row[] = MODULES.map((m) => ({ ...m, audience: switches[m.code] ?? 'off' }));

  return (
    <>
      <PageTitle title="Modules" subtitle="The full ERP's modules, built here in waves" />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Card>
        <DataTable rows={rows} columns={columns} rowKey={(m) => m.code} />
      </Card>
    </>
  );
}
