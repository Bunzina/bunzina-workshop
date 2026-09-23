import type { ExecutionStatus } from '../types/execution-status';

export class InvalidExecutionStatusError extends Error {
  constructor(action: string, status: ExecutionStatus) {
    super(`Cannot ${action} a service order that is ${status}`);
    this.name = 'InvalidExecutionStatusError';
  }
}
