import Elysia from 'elysia';
import { StatusCodes } from 'http-status-codes';
import type { CompleteDiagnostic } from '@/application/use-cases/execution/complete-diagnostic';
import {
  ExecutionNotFoundError,
  InvalidExecutionStatusError,
} from '@/domain/execution/errors/execution-errors';
import {
  completeDiagnosticBodySchema,
  diagnosticParamsSchema,
  diagnosticResponseSchema,
  errorResponseSchema,
} from './schemas/complete-diagnostic-schema';

export const makeDiagnosticRoutes = (completeDiagnostic: CompleteDiagnostic) =>
  new Elysia({ prefix: '/diagnostics' }).patch(
    '/:serviceOrderId',
    async ({ params, body, status }) => {
      try {
        const queueItem = await completeDiagnostic.execute({
          serviceOrderId: params.serviceOrderId,
          ...body,
        });

        return {
          serviceOrderId: queueItem.serviceOrderId,
          status: queueItem.status,
          diagnosedAt: queueItem.diagnosedAt?.toISOString() ?? '',
        };
      } catch (error) {
        if (error instanceof ExecutionNotFoundError) {
          return status(StatusCodes.NOT_FOUND, { message: error.message });
        }

        if (error instanceof InvalidExecutionStatusError) {
          return status(StatusCodes.CONFLICT, { message: error.message });
        }

        throw error;
      }
    },
    {
      params: diagnosticParamsSchema,
      body: completeDiagnosticBodySchema,
      response: {
        [StatusCodes.OK]: diagnosticResponseSchema,
        [StatusCodes.NOT_FOUND]: errorResponseSchema,
        [StatusCodes.CONFLICT]: errorResponseSchema,
      },
      detail: {
        tags: ['Diagnostics'],
        summary: 'Conclui o diagnóstico de uma OS',
        description:
          'O mecânico informa os itens reais encontrados, que podem diferir do que o cliente pediu. Publica evt.workshop.diagnostic-completed para o Billing emitir o orçamento final.',
      },
    },
  );
