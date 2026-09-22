import { describe, expect, it } from 'bun:test';
import { Money } from './money';

describe('Money', () => {
  it('keeps the amount in cents and the currency', () => {
    const money = new Money(12000, 'BRL');

    expect(money.amountCents).toBe(12000);
    expect(money.currency).toBe('BRL');
  });

  it('defaults to BRL', () => {
    expect(new Money(100).currency).toBe('BRL');
  });

  it('accepts zero', () => {
    expect(new Money(0).amountCents).toBe(0);
  });

  it('rejects a negative amount', () => {
    expect(() => new Money(-1)).toThrow('Money cannot be negative');
  });

  it('rejects an amount that is not in whole cents', () => {
    expect(() => new Money(12.5)).toThrow('Money must be an integer of cents');
  });

  it('multiplies by a quantity into a new value', () => {
    const unit = new Money(4500);

    const total = unit.times(3);

    expect(total.amountCents).toBe(13500);
    expect(total.currency).toBe('BRL');
    expect(unit.amountCents).toBe(4500);
  });

  it('keeps the currency when multiplying', () => {
    expect(new Money(100, 'USD').times(2).currency).toBe('USD');
  });
});
