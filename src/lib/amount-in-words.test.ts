import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { amountInWords } from './format';

const words = (decimal: string) => amountInWords(Money.fromDecimal(decimal));

describe('amountInWords', () => {
  it('spells zero', () => {
    expect(words('0')).toBe('Taka Zero Only');
  });

  it('spells a plain taka amount', () => {
    expect(words('500')).toBe('Taka Five Hundred Only');
    expect(words('999')).toBe('Taka Nine Hundred Ninety Nine Only');
  });

  it('spells the teens and the exact tens', () => {
    expect(words('13')).toBe('Taka Thirteen Only');
    expect(words('20')).toBe('Taka Twenty Only');
  });

  it('spells poisha after the taka', () => {
    expect(words('1234.56')).toBe(
      'Taka One Thousand Two Hundred Thirty Four and Fifty Six Poisha Only',
    );
  });

  it('spells poisha-only amounts', () => {
    expect(words('0.05')).toBe('Taka Zero and Five Poisha Only');
  });

  it('uses the lakh and crore scale', () => {
    expect(words('100000')).toBe('Taka One Lakh Only');
    expect(words('10000000')).toBe('Taka One Crore Only');
    expect(words('12345678.90')).toBe(
      'Taka One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Ninety Poisha Only',
    );
  });

  it('recurses past ninety-nine crore', () => {
    expect(words('1000000000000')).toBe('Taka One Lakh Crore Only');
  });

  it('marks negative amounts with Minus', () => {
    expect(words('-50')).toBe('Minus Taka Fifty Only');
  });
});
