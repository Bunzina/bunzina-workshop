import { describe, expect, it } from 'bun:test';
import { ExecutionStatus, isTerminalStatus } from './execution-status';

describe('ExecutionStatus', () => {
  it('covers the seven statuses of the execution lifecycle', () => {
    expect(Object.values<string>(ExecutionStatus)).toEqual([
      'QUEUED',
      'IN_DIAGNOSTIC',
      'DIAGNOSED',
      'IN_EXECUTION',
      'COMPLETED',
      'FAILED',
      'ABORTED',
    ]);
  });
});

describe('isTerminalStatus', () => {
  it.each([
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.ABORTED,
  ])('treats %s as terminal', (status) => {
    expect(isTerminalStatus(status)).toBe(true);
  });

  it.each([
    ExecutionStatus.QUEUED,
    ExecutionStatus.IN_DIAGNOSTIC,
    ExecutionStatus.DIAGNOSED,
    ExecutionStatus.IN_EXECUTION,
  ])('treats %s as still open', (status) => {
    expect(isTerminalStatus(status)).toBe(false);
  });
});
