import { describe, expect, it } from 'bun:test';
import { ExecutionStatus } from '../types/execution-status';
import { ExecutionLog } from './execution-log';

describe('ExecutionLog', () => {
  it('records what happened to a service order', () => {
    const log = new ExecutionLog({
      serviceOrderId: 'order-1',
      event: 'diagnostic-started',
      status: ExecutionStatus.IN_DIAGNOSTIC,
      detail: 'Correia dentada com folga',
    });

    expect(log.serviceOrderId).toBe('order-1');
    expect(log.event).toBe('diagnostic-started');
    expect(log.status).toBe(ExecutionStatus.IN_DIAGNOSTIC);
    expect(log.detail).toBe('Correia dentada com folga');
  });

  it('stamps the moment it happened', () => {
    const log = new ExecutionLog({
      serviceOrderId: 'order-1',
      event: 'diagnostic-started',
      status: ExecutionStatus.IN_DIAGNOSTIC,
    });

    expect(log.occurredAt).toBeDate();
  });

  it('keeps the moment it was rebuilt with', () => {
    const occurredAt = new Date('2026-09-17T16:55:00.000Z');

    const log = new ExecutionLog({
      serviceOrderId: 'order-1',
      event: 'execution-aborted',
      status: ExecutionStatus.ABORTED,
      reason: 'TIMEOUT',
      occurredAt,
    });

    expect(log.occurredAt).toBe(occurredAt);
    expect(log.reason).toBe('TIMEOUT');
  });

  it('rejects a log without a service order', () => {
    expect(
      () =>
        new ExecutionLog({
          serviceOrderId: '',
          event: 'diagnostic-started',
          status: ExecutionStatus.IN_DIAGNOSTIC,
        }),
    ).toThrow('ExecutionLog requires a serviceOrderId');
  });
});
