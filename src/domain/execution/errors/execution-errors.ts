import type { ExecutionStatus } from '../types/execution-status';

export class ExecutionNotFoundError extends Error {
  constructor(serviceOrderId: string) {
    super(`Service order ${serviceOrderId} is not in the workshop queue`);
    this.name = 'ExecutionNotFoundError';
  }
}

export class InvalidExecutionStatusError extends Error {
  constructor(action: string, status: ExecutionStatus) {
    super(`Cannot ${action} a service order that is ${status}`);
    this.name = 'InvalidExecutionStatusError';
  }
}
