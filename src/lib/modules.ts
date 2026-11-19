/**
 * The full ERP's 22 modules, as this app carries them (owner, 2026-10-29).
 *
 * The list and its places come from docs/plans/2026-10-29-full-erp-modules.md
 * and the codes from the full ERP's module-blueprint.md, so a module is called
 * the same thing in both apps. Pure and with no imports beyond a type, like
 * permissions.ts, so it is tested on its own.
 *
 * A module is switched per audience in the module_switch table: off, owner
 * only, or everyone. No row means off. A module is tried by the owner and the
 * champion users before staff are offered it, and the rail lists only what the
 * signed-in person may see, so nobody is offered a screen that opens onto
 * nothing.
 *
 * Only a module with `built` set can be switched on. The others are listed on
 * the Modules screen as planned, with their wave, and cannot be offered.
 */

export type Audience = 'off' | 'owner' | 'everyone';

export const AUDIENCES: readonly Audience[] = ['off', 'owner', 'everyone'];

/** Where a module runs, from the plan. */
export type Place = 'live' | 'book' | 'shadow' | 'lab' | 'here' | 'full_erp';

export type ModuleInfo = {
  code: string;
  name: string;
  place: Place;
  /** The wave that builds it here, or null for one that is not built here. */
  wave: number | null;
  /** Screens exist, so it may be switched on. */
  built: boolean;
  /** Where part of a module runs somewhere else than the rest. */
  note?: string;
};

export const MODULES: readonly ModuleInfo[] = [
  { code: 'SYS', name: 'System and Admin', place: 'full_erp', wave: null, built: false, note: 'Users, roles, audit and numbering already run here' },
  { code: 'LIB', name: 'Setup Library', place: 'live', wave: 1, built: false },
  { code: 'INT', name: 'API and Integrations', place: 'full_erp', wave: null, built: false, note: 'Excel export already runs here' },
  { code: 'AUT', name: 'Automation', place: 'live', wave: 4, built: false },
  { code: 'AIA', name: 'Smart Assist', place: 'lab', wave: null, built: false },
  { code: 'MER', name: 'Merchandising', place: 'live', wave: 4, built: false, note: 'Sales Orders already run here' },
  { code: 'COM', name: 'Commercial', place: 'book', wave: 2, built: false },
  { code: 'PUR', name: 'Purchase', place: 'live', wave: 3, built: false, note: 'Purchase Orders already run here' },
  { code: 'PPC', name: 'Planning', place: 'live', wave: 3, built: false, note: 'Work Orders already run here' },
  { code: 'KNT', name: 'Knitting', place: 'live', wave: 3, built: false },
  { code: 'DYF', name: 'Dyeing and Finishing', place: 'live', wave: 3, built: false },
  { code: 'SUB', name: 'Sub-Contract Control', place: 'live', wave: 3, built: false, note: 'Bill check in wave 5' },
  { code: 'QCL', name: 'QC and Lab', place: 'live', wave: 4, built: false },
  { code: 'STR', name: 'Store and Inventory', place: 'live', wave: 3, built: false, note: 'Valuation in Shadow, wave 6' },
  { code: 'DLV', name: 'Challan and Delivery', place: 'live', wave: 3, built: false },
  { code: 'BIL', name: 'Billing and Receivables', place: 'book', wave: 2, built: false, note: 'Customer Bills already run here' },
  { code: 'ACC', name: 'Accounts and Finance', place: 'book', wave: 2, built: false, note: 'Ledger in Shadow, wave 6' },
  { code: 'MIS', name: 'Costing and MIS', place: 'live', wave: 4, built: false, note: 'Order Costing already runs here' },
  { code: 'HRM', name: 'HR and Payroll', place: 'here', wave: null, built: false, note: 'Already runs here, always on' },
  { code: 'VAT', name: 'VAT and Tax', place: 'lab', wave: null, built: false },
  { code: 'CMP', name: 'Compliance and Traceability', place: 'lab', wave: null, built: false },
  { code: 'PRT', name: 'Portals and Mobile', place: 'lab', wave: null, built: false },
];

export function findModule(code: string): ModuleInfo | undefined {
  return MODULES.find((module) => module.code === code);
}

export function isAudience(value: string): value is Audience {
  return (AUDIENCES as readonly string[]).includes(value);
}

/** Whether a role is offered a module switched to this audience. */
export function canSee(audience: Audience | undefined, role: string): boolean {
  if (audience === 'everyone') return true;
  if (audience === 'owner') return role === 'owner';
  return false;
}

export function audienceLabel(audience: Audience): string {
  return { off: 'Off', owner: 'Owner Only', everyone: 'Everyone' }[audience];
}

export function placeLabel(place: Place): string {
  return {
    live: 'Live',
    book: 'Live, in the Book',
    shadow: 'Shadow',
    lab: 'Lab',
    here: 'Already Here',
    full_erp: 'Full ERP Only',
  }[place];
}
