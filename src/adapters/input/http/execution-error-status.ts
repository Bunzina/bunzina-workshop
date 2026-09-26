import { StatusCodes } from 'http-status-codes';
import {
  ExecutionItemAlreadyCompletedError,
  ExecutionItemNotFoundError,
  ExecutionNotFoundError,
  InvalidExecutionStatusError,
} from '@/domain/execution/errors/execution-errors';

export type ExecutionErrorStatus =
  | StatusCodes.NOT_FOUND
  | StatusCodes.CONFLICT
  | StatusCodes.UNPROCESSABLE_ENTITY;

export const executionErrorStatus = (
  error: unknown,
): ExecutionErrorStatus | undefined => {
  if (error instanceof ExecutionNotFoundError) {
    return StatusCodes.NOT_FOUND;
  }

  if (error instanceof ExecutionItemNotFoundError) {
    return StatusCodes.UNPROCESSABLE_ENTITY;
  }

  if (
    error instanceof InvalidExecutionStatusError ||
    error instanceof ExecutionItemAlreadyCompletedError
  ) {
    return StatusCodes.CONFLICT;
  }

  return undefined;
};
