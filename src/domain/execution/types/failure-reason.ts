export const failureReasons = [
  'PART_UNAVAILABLE',
  'EXPIRED',
  'REJECTED',
  'TIMEOUT',
  'PROVIDER_ERROR',
  'CUSTOMER_REQUEST',
  'UNREPAIRABLE',
] as const;

export type FailureReason = (typeof failureReasons)[number];
