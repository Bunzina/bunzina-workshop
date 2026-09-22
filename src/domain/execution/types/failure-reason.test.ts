import { describe, expect, it } from 'bun:test';
import { failureReasons } from './failure-reason';

describe('failureReasons', () => {
  it('covers the seven reasons of the frozen contract', () => {
    expect([...failureReasons]).toEqual([
      'PART_UNAVAILABLE',
      'EXPIRED',
      'REJECTED',
      'TIMEOUT',
      'PROVIDER_ERROR',
      'CUSTOMER_REQUEST',
      'UNREPAIRABLE',
    ]);
  });
});
