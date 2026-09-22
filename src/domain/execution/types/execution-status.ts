export enum ExecutionStatus {
  QUEUED = 'QUEUED',
  IN_DIAGNOSTIC = 'IN_DIAGNOSTIC',
  DIAGNOSED = 'DIAGNOSED',
  IN_EXECUTION = 'IN_EXECUTION',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ABORTED = 'ABORTED',
}

const terminalStatuses = new Set<ExecutionStatus>([
  ExecutionStatus.COMPLETED,
  ExecutionStatus.FAILED,
  ExecutionStatus.ABORTED,
]);

export const isTerminalStatus = (status: ExecutionStatus): boolean =>
  terminalStatuses.has(status);
