import { describe, expect, it } from 'vitest';
import { billFormSchema, billLineSchema, firstError } from './schemas';

/**
 * The boundary has one job: turn anything typed into either clean input or a
 * message a person can act on. It must never throw, because a thrown parser is a
 * crashed form rather than a red field, and a blank box is the everyday case.
 */

const line = {
  description: 'S/J 100% Cotton, Lot 12',
  color: 'Black',
  challanNo: '1050',
  orderNo: '75-T',
  lotNo: 'LOT-9',
  greyKg: '1240.5',
  finishedKg: '1198.25',
  rate: '159.00',
};

describe('billLineSchema', () => {
  it('accepts a line as the paper bill reads', () => {
    const parsed = billLineSchema.parse(line);
    expect(parsed.greyKg).toBe('1240.5');
    expect(parsed.finishedKg).toBe('1198.25');
    expect(parsed.challanNo).toBe('1050');
  });

  it('treats a blank finished weight as not yet known', () => {
    expect(billLineSchema.parse({ ...line, finishedKg: '' }).finishedKg).toBe(
      null,
    );
    expect(
      billLineSchema.parse({ ...line, finishedKg: undefined }).finishedKg,
    ).toBe(null);
  });

  it('leaves blank optional text absent rather than empty', () => {
    const parsed = billLineSchema.parse({
      ...line,
      challanNo: '',
      orderNo: '',
      lotNo: '',
      color: '',
    });
    expect(parsed.challanNo).toBeNull();
    expect(parsed.orderNo).toBeNull();
    // Recorded when the paper bill states them, absent when it does not.
    expect(parsed.lotNo).toBeNull();
    expect(parsed.color).toBeNull();
  });

  // Each of these used to throw a RangeError out of the refinement instead of
  // failing validation, which crashed the form rather than marking the field.
  it.each([
    ['a blank grey weight', { greyKg: '' }],
    ['a blank rate', { rate: '' }],
    ['a blank finished weight that is not empty but invalid', {
      finishedKg: 'abc',
    }],
    ['a grey weight that is not a number', { greyKg: 'twelve' }],
    ['a negative grey weight', { greyKg: '-5' }],
    ['a zero grey weight', { greyKg: '0' }],
    ['a rate that is not a number', { rate: 'nine' }],
    ['too many decimals on the weight', { greyKg: '1.2345' }],
    ['too many decimals on the rate', { rate: '1.2345678' }],
    ['a missing description', { description: '' }],
  ])('reports %s without throwing', (_name, patch) => {
    const result = billLineSchema.safeParse({ ...line, ...patch });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstError(result.error)).toMatch(/\S/);
    }
  });
});

describe('billFormSchema', () => {
  const bill = {
    partyId: '11111111-1111-4111-8111-111111111111',
    direction: 'issued' as const,
    billNo: '889',
    billDate: '2026-07-28',
    notes: '',
    reason: '',
    lines: [line],
  };

  it('accepts a bill with its hand-written number', () => {
    const parsed = billFormSchema.parse(bill);
    expect(parsed.billNo).toBe('889');
    expect(parsed.lines).toHaveLength(1);
  });

  it('requires the hand-written bill number on both sides', () => {
    const result = billFormSchema.safeParse({ ...bill, billNo: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstError(result.error)).toMatch(/bill number/i);
    }
  });

  it('keeps the lot number off a line that has none', () => {
    const line = { ...bill.lines[0]!, lotNo: '' };
    expect(billFormSchema.parse({ ...bill, lines: [line] }).lines[0]!.lotNo)
      .toBeNull();
  });

  it('refuses a bill with no lines', () => {
    const result = billFormSchema.safeParse({ ...bill, lines: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstError(result.error)).toMatch(/at least one bill line/i);
    }
  });

  it('refuses a date that is not a real day', () => {
    expect(billFormSchema.safeParse({ ...bill, billDate: '2026-02-30' }).success).toBe(
      false,
    );
    expect(billFormSchema.safeParse({ ...bill, billDate: '' }).success).toBe(
      false,
    );
  });
});
