import { describe, expect, it } from 'bun:test';
import { Money } from '@/domain/core/value-objects/money';
import { ExecutionItemKind } from '../types/execution-item-kind';
import { ExecutionItem } from './execution-item';

const service = {
  kind: ExecutionItemKind.SERVICE,
  referenceId: 'service-1',
  description: 'Troca de correia',
};

describe('ExecutionItem', () => {
  it('keeps what identifies the item', () => {
    const item = new ExecutionItem(service);

    expect(item.kind).toBe(ExecutionItemKind.SERVICE);
    expect(item.referenceId).toBe('service-1');
    expect(item.description).toBe('Troca de correia');
  });

  it('defaults to a single unit that is not completed yet', () => {
    const item = new ExecutionItem(service);

    expect(item.quantity).toBe(1);
    expect(item.isCompleted).toBe(false);
    expect(item.finishedAt).toBeUndefined();
  });

  it('accepts an item without price, as the execution command sends it', () => {
    const item = new ExecutionItem(service);

    expect(item.unitPrice).toBeUndefined();
    expect(item.totalPrice).toBeUndefined();
  });

  it('totals the price by quantity', () => {
    const item = new ExecutionItem({
      kind: ExecutionItemKind.AUTO_PART,
      referenceId: 'auto-part-1',
      quantity: 3,
      unitPrice: new Money(4500),
    });

    expect(item.totalPrice?.amountCents).toBe(13500);
  });

  it('keeps a total that was given instead of deriving it', () => {
    const item = new ExecutionItem({
      ...service,
      quantity: 2,
      unitPrice: new Money(1000),
      totalPrice: new Money(1500),
    });

    expect(item.totalPrice?.amountCents).toBe(1500);
  });

  it('rejects an item without a reference', () => {
    expect(() => new ExecutionItem({ ...service, referenceId: ' ' })).toThrow(
      'ExecutionItem requires a referenceId',
    );
  });

  it('rejects a quantity below one', () => {
    expect(() => new ExecutionItem({ ...service, quantity: 0 })).toThrow(
      'Quantity cannot be zero or negative',
    );
  });
});
