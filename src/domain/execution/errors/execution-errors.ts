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

export class ExecutionItemNotFoundError extends Error {
  constructor(serviceOrderId: string, serviceId: string) {
    super(
      `Service ${serviceId} is not part of the execution of service order ${serviceOrderId}`,
    );
    this.name = 'ExecutionItemNotFoundError';
  }
}

export class ExecutionItemAlreadyCompletedError extends Error {
  constructor(serviceOrderId: string, serviceId: string) {
    super(
      `Service ${serviceId} of service order ${serviceOrderId} is already completed`,
    );
    this.name = 'ExecutionItemAlreadyCompletedError';
  }
}
