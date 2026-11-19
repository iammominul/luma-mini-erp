import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../scripts/split-sql.mjs';
import { createPgDriver, type PgDriver } from './pg-driver';
import type {
  BillFormInput,
  ExpenseFormInput,
  PurchaseOrderFormInput,
  SalesOrderFormInput,
  WorkOrderFormInput,
} from './schemas';

/**
 * Sales, Purchase and Work Orders, and an order costed end to end, against a
 * real Postgres in a throwaway schema of its own.
 *   INTERIM_TEST_DATABASE_URL=postgresql://luma:luma@localhost:5434/interim_test pnpm test
 */

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;
const TEST_ACTOR = { id: 'test-user', name: 'Test User' };
const SCHEMA = 'interim_orders_test';

let driver: PgDriver;

vi.mock('./db', () => ({
  db: () => driver,
}));

describe.skipIf(!CONNECTION)('orders', () => {
  const party: Record<string, string> = {};
  let soId = '';
  let fabricLineId = '';
  let dyeingLineId = '';
  let poLineId = '';
  let knitLineId = '';
  let dyeLineId = '';

  beforeAll(async () => {
    const admin = createPgDriver(CONNECTION!, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();
    driver = createPgDriver(CONNECTION!, SCHEMA);
    const schemaSql = readFileSync(
      join(import.meta.dirname, '..', '..', 'db', 'schema.sql'),
      'utf8',
    );
    for (const statement of splitSqlStatements(schemaSql)) {
      await driver.query(statement);
    }

    const { createParty } = await import('./mutations');
    for (const [key, name, role] of [
      ['buyer', 'Orders Garments Ltd', 'customer'],
      ['other', 'Another Buyer Ltd', 'customer'],
      ['spinner', 'Orders Spinning Mills', 'supplier'],
      ['knitter', 'Orders Knitting', 'subcontractor'],
      ['dyer', 'Orders Dyeing', 'subcontractor'],
    ] as const) {
      party[key] = await createParty(
        {
          code: null,
          name,
          roles: [role],
          contactPerson: null,
          phone: null,
          address: null,
          openingBalance: '0',
          openingAsOf: null,
        },
        TEST_ACTOR,
      );
    }
  }, 60_000);

  afterAll(async () => {
    if (!CONNECTION) return;
    await driver.end();
    const admin = createPgDriver(CONNECTION, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  const so = (patch: Partial<SalesOrderFormInput> = {}): SalesOrderFormInput => ({
    partyId: party.buyer!,
    orderDate: '2026-10-06',
    customerRef: 'BUYER-PO-7781',
    notes: null,
    reason: null,
    lines: [
      {
        id: null,
        category: 'fabric',
        description: 'S/J 30/1 CVC 60/40, 160 GSM',
        color: 'Navy',
        quantity: '1000',
        rate: '520',
      },
      {
        id: null,
        category: 'dyeing_service',
        description: '1x1 Rib, customer grey',
        color: 'Black',
        quantity: '400',
        rate: '110',
      },
    ],
    ...patch,
  });

  const bill = (
    partyId: string,
    role: BillFormInput['partyRole'],
    billNo: string | null,
    line: Partial<BillFormInput['lines'][number]>,
  ): BillFormInput => ({
    partyId,
    direction: role === 'customer' ? 'issued' : 'received',
    partyRole: role,
    status: 'posted',
    billNo,
    natureOfWork: 'dyeing_finishing',
    billDate: '2026-10-20',
    narration: null,
    notes: null,
    reason: null,
    lines: [
      {
        description: 'Line',
        color: null,
        challanNo: null,
        orderNo: null,
        lotNo: null,
        orderLineId: null,
        sourceLineId: null,
        greyKg: '100',
        finishedKg: null,
        rate: '1',
        ...line,
      },
    ],
  });

  const expense = (patch: Partial<ExpenseFormInput>): ExpenseFormInput => ({
    spentOn: '2026-10-21',
    category: 'freight_inward',
    payee: 'Van',
    description: 'Transport',
    amount: '1000.00',
    mode: 'cash',
    reference: null,
    orderNo: null,
    salesOrderId: null,
    orderLineId: null,
    notes: null,
    reason: null,
    ...patch,
  });

  it('books a Sales Order under an SO number and reads it back', async () => {
    const { createSalesOrder } = await import('./mutations');
    const { findSalesOrder, listSalesOrders } = await import('./queries');
    soId = await createSalesOrder(so(), TEST_ACTOR);
    const order = await findSalesOrder('so-26-0001');
    expect(order!.id).toBe(soId);
    expect(order!.lines.map((l) => l.unit)).toEqual(['kg', 'kg']);
    fabricLineId = order!.lines[0]!.id;
    dyeingLineId = order!.lines[1]!.id;

    const [summary] = await listSalesOrders();
    // 1000 x 520 + 400 x 110
    expect(summary!.bookedValue.toDecimalString()).toBe('564000.00');
    expect(summary!.stage).toBe('booked');
    expect(summary!.categories).toEqual(['fabric', 'dyeing_service']);
  }, 30_000);

  it('buys yarn and sends out knitting and dyeing against the order', async () => {
    const { createPurchaseOrder, createWorkOrder } = await import('./mutations');
    const { findPurchaseOrder, findWorkOrder, listSalesOrders } = await import('./queries');

    const po: PurchaseOrderFormInput = {
      partyId: party.spinner!,
      orderDate: '2026-10-07',
      deliverToId: party.knitter!,
      deliveryBy: '2026-10-10',
      terms: null,
      notes: null,
      reason: null,
      lines: [
        { id: null, orderLineId: fabricLineId, description: '30/1 CVC 60/40', quantityKg: '1050', rate: '300' },
      ],
    };
    await createPurchaseOrder(po, TEST_ACTOR);
    const savedPo = await findPurchaseOrder('PO-26-0001');
    expect(savedPo!.total.toDecimalString()).toBe('315000.00');
    expect(savedPo!.deliverToName).toBe('Orders Knitting');
    poLineId = savedPo!.lines[0]!.id;
    expect((await listSalesOrders())[0]!.stage).toBe('yarn_ordered');

    const wo = (process: WorkOrderFormInput['process'], partyId: string, orderLineId: string, rate: string): WorkOrderFormInput => ({
      partyId,
      process,
      orderDate: '2026-10-11',
      deliverToId: null,
      deliveryBy: '2026-10-15',
      terms: null,
      notes: null,
      reason: null,
      lines: [
        { id: null, orderLineId, description: 'Work', color: null, gsm: '160', dia: '30 Open', quantityKg: '1000', rate },
      ],
    });
    await createWorkOrder(wo('knitting', party.knitter!, fabricLineId, '12'), TEST_ACTOR);
    expect((await listSalesOrders())[0]!.stage).toBe('in_knitting');
    await createWorkOrder(wo('dyeing_finishing', party.dyer!, fabricLineId, '110'), TEST_ACTOR);
    expect((await listSalesOrders())[0]!.stage).toBe('in_dyeing');

    knitLineId = (await findWorkOrder('WO-26-0001'))!.lines[0]!.id;
    dyeLineId = (await findWorkOrder('WO-26-0002'))!.lines[0]!.id;
  }, 30_000);

  it('refuses work an order line cannot take', async () => {
    const { createPurchaseOrder, createWorkOrder } = await import('./mutations');
    // Yarn for a dyeing service, and knitting for one: the fabric is the customer's.
    await expect(
      createPurchaseOrder(
        {
          partyId: party.spinner!, orderDate: '2026-10-07', deliverToId: null, deliveryBy: null,
          terms: null, notes: null, reason: null,
          lines: [{ id: null, orderLineId: dyeingLineId, description: 'Yarn', quantityKg: '10', rate: '1' }],
        },
        TEST_ACTOR,
      ),
    ).rejects.toThrow(/dyeing service line and cannot take/);
    await expect(
      createWorkOrder(
        {
          partyId: party.knitter!, process: 'knitting', orderDate: '2026-10-07', deliverToId: null,
          deliveryBy: null, terms: null, notes: null, reason: null,
          lines: [{ id: null, orderLineId: dyeingLineId, description: 'Knit', color: null, gsm: null, dia: null, quantityKg: '10', rate: '1' }],
        },
        TEST_ACTOR,
      ),
    ).rejects.toThrow(/cannot take/);
    // A PO goes to a supplier, never a subcontractor.
    await expect(
      createPurchaseOrder(
        {
          partyId: party.knitter!, orderDate: '2026-10-07', deliverToId: null, deliveryBy: null,
          terms: null, notes: null, reason: null,
          lines: [{ id: null, orderLineId: fabricLineId, description: 'Yarn', quantityKg: '10', rate: '1' }],
        },
        TEST_ACTOR,
      ),
    ).rejects.toThrow(/Select a supplier/);
  });

  it('ties every bill line to the order and checks it belongs there', async () => {
    const { createBill } = await import('./mutations');
    const { getBill } = await import('./queries');

    // The spinner bills the yarn through the PO line.
    const yarnId = await createBill(
      bill(party.spinner!, 'supplier', 'SP-1', { sourceLineId: poLineId, greyKg: '1050', rate: '300' }),
      TEST_ACTOR,
    );
    const yarn = await getBill(yarnId);
    expect(yarn!.lines[0]!.orderLineId).toBe(fabricLineId);
    expect(yarn!.lines[0]!.sourceRef).toBe('PO-26-0001 / 1');
    // The free text reference is written from the order, so old reports agree.
    expect(yarn!.lines[0]!.orderNo).toBe('BUYER-PO-7781');

    await createBill(
      bill(party.knitter!, 'subcontractor', 'KN-1', { sourceLineId: knitLineId, greyKg: '1000', rate: '12' }),
      TEST_ACTOR,
    );
    // The dye house billed only part of the dyeing so far.
    await createBill(
      bill(party.dyer!, 'subcontractor', 'DY-1', { sourceLineId: dyeLineId, greyKg: '600', rate: '110' }),
      TEST_ACTOR,
    );

    // Another customer's order is refused on this buyer's bill, and the
    // reverse: a WO issued to the dye house is refused on the knitter's bill.
    await expect(
      createBill(bill(party.other!, 'customer', null, { orderLineId: fabricLineId }), TEST_ACTOR),
    ).rejects.toThrow(/belongs to Orders Garments Ltd/);
    await expect(
      createBill(bill(party.knitter!, 'subcontractor', 'KN-2', { sourceLineId: dyeLineId }), TEST_ACTOR),
    ).rejects.toThrow(/issued to another party/);
  }, 30_000);

  it('files a transport trip against one line and freight against the whole order', async () => {
    const { createExpense } = await import('./mutations');
    const { getExpense } = await import('./queries');
    // A line implies its order, whatever order was posted beside it.
    const tripId = await createExpense(
      expense({ amount: '3500.00', orderLineId: fabricLineId }),
      TEST_ACTOR,
    );
    const trip = await getExpense(tripId);
    expect(trip!.salesOrderId).toBe(soId);
    expect(trip!.orderDocNo).toBe('SO-26-0001');
    await createExpense(
      expense({ amount: '2000.00', category: 'lab_test', salesOrderId: soId }),
      TEST_ACTOR,
    );
    // Overhead filed against an order is still never charged to it.
    await createExpense(
      expense({ amount: '9999.00', category: 'office', salesOrderId: soId }),
      TEST_ACTOR,
    );
  });

  it('costs the order end to end, stopping at contribution', async () => {
    const { createBill } = await import('./mutations');
    const { salesOrderFigures } = await import('./queries');
    const { orderCosting } = await import('./order-costing');

    await createBill(
      bill(party.buyer!, 'customer', '1301', { orderLineId: fabricLineId, greyKg: '1000', rate: '520' }),
      TEST_ACTOR,
    );

    const figures = await salesOrderFigures(soId);
    const result = orderCosting(figures!);
    const fabric = result.lines[0]!;
    expect(fabric.billed.toDecimalString()).toBe('520000.00');
    expect(fabric.billedQty).toBe('1000.000');
    expect(fabric.yarnBilled.toDecimalString()).toBe('315000.00');
    expect(fabric.knittingBilled.toDecimalString()).toBe('12000.00');
    expect(fabric.dyeingBilled.toDecimalString()).toBe('66000.00');
    expect(fabric.transport.toDecimalString()).toBe('3500.00');
    // Dyeing was ordered for 1000 kg at 110 and billed for 600 so far.
    expect(fabric.unbilledCommitment.toDecimalString()).toBe('44000.00');
    // 5,20,000 less 3,15,000 yarn, 12,000 knitting, 66,000 dyeing, 3,500 transport.
    expect(fabric.contribution.toDecimalString()).toBe('123500.00');

    // The lab test sits on the order, not on a line; the office cost nowhere.
    expect(result.orderLevel.otherDirect.toDecimalString()).toBe('2000.00');
    expect(result.contribution.toDecimalString()).toBe('121500.00');
  }, 30_000);

  it('lists every document filed against the order', async () => {
    const { salesOrderDocuments } = await import('./queries');
    const docs = await salesOrderDocuments(soId);
    expect(docs.purchaseOrders.map((d) => d.docNo)).toEqual(['PO-26-0001']);
    expect(docs.workOrders.map((d) => d.docNo)).toEqual(['WO-26-0001', 'WO-26-0002']);
    expect(docs.bills.map((b) => b.docNo).sort()).toEqual([
      'BR-26-0001', 'BR-26-0002', 'BR-26-0003', 'CB-26-0001',
    ]);
    expect(docs.expenses).toHaveLength(3);
    expect(docs.expenses.find((e) => e.amount.toDecimalString() === '3500.00')!.lineNo).toBe(1);
  });

  it('edits a line in place and refuses to remove one with documents on it', async () => {
    const { updateSalesOrder } = await import('./mutations');
    const { getSalesOrder } = await import('./queries');
    const current = await getSalesOrder(soId);
    const lines = current!.lines.map((l) => ({
      id: l.id, category: l.category, description: l.description, color: l.color,
      quantity: l.quantity, rate: l.rate,
    }));

    // Dropping the fabric line, which has bills, POs and WOs on it, is refused.
    await expect(
      updateSalesOrder(soId, so({ lines: [lines[1]!], reason: 'Trim' }), TEST_ACTOR),
    ).rejects.toThrow(/cannot be removed/);

    // Reordering and repricing keeps the same rows, so every link survives.
    await updateSalesOrder(
      soId,
      so({ lines: [{ ...lines[1]!, rate: '115' }, lines[0]!], reason: 'Rate agreed' }),
      TEST_ACTOR,
    );
    const after = await getSalesOrder(soId);
    expect(after!.lines.map((l) => l.id)).toEqual([dyeingLineId, fabricLineId]);
    expect(after!.lines[0]!.rate).toBe('115.000000');
  }, 30_000);

  it('cannot cancel an order with documents on it, and a closed order takes nothing new', async () => {
    const { createBill, createSalesOrder, setSalesOrderStatus } = await import('./mutations');
    const { listSalesOrders } = await import('./queries');
    await expect(
      setSalesOrderStatus(soId, 'cancelled', 'Buyer withdrew', TEST_ACTOR),
    ).rejects.toThrow(/cannot be cancelled/);

    // An empty order cancels.
    const spare = await createSalesOrder(so({ customerRef: 'SPARE' }), TEST_ACTOR);
    await setSalesOrderStatus(spare, 'cancelled', 'Booked twice', TEST_ACTOR);

    await setSalesOrderStatus(soId, 'closed', 'Delivered and billed', TEST_ACTOR);
    await expect(
      createBill(bill(party.buyer!, 'customer', null, { orderLineId: dyeingLineId }), TEST_ACTOR),
    ).rejects.toThrow(/is closed and takes no new bills/);
    const stages = Object.fromEntries((await listSalesOrders()).map((o) => [o.customerRef, o.stage]));
    expect(stages).toEqual({ 'BUYER-PO-7781': 'closed', SPARE: 'cancelled' });
  }, 30_000);

  it('answers the dashboard: attention counts and top customers', async () => {
    const { attentionCounts, topCustomers } = await import('./queries');
    const { setSalesOrderStatus } = await import('./mutations');
    await setSalesOrderStatus(soId, 'open', 'Reopened to check the dashboard', TEST_ACTOR);

    const counts = await attentionCounts('2026-10-30');
    // Both WOs were due by 15 October and are still open.
    expect(counts.overdueWorkOrders).toBe(2);
    // The fabric line is billed to the customer, so nothing is unbilled.
    expect(counts.unbilledOrderLines).toBe(0);

    const top = await topCustomers('2026-10-01', '2026-10-31');
    expect(top.customers.map((c) => c.name)).toEqual(['Orders Garments Ltd']);
    expect(top.total.toDecimalString()).toBe('520000.00');
  });
});
