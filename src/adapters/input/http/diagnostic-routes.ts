import Elysia from 'elysia';
import { StatusCodes } from 'http-status-codes';
import type { CompleteDiagnostic } from '@/application/use-cases/execution/complete-diagnostic';
import type { FailDiagnostic } from '@/application/use-cases/execution/fail-diagnostic';
import { executionErrorStatus } from './execution-error-status';
import {
  completeDiagnosticBodySchema,
  diagnosticParamsSchema,
  diagnosticResponseSchema,
  errorResponseSchema,
} from './schemas/complete-diagnostic-schema';
import {
  failDiagnosticBodySchema,
  failureResponseSchema,
} from './schemas/failure-schema';

export const makeDiagnosticRoutes = (
  completeDiagnostic: CompleteDiagnostic,
  failDiagnostic: FailDiagnostic,
) =>
  new Elysia({ prefix: '/diagnostics' })
    .patch(
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
          const code = executionErrorStatus(error);

          if (code) {
            return status(code, { message: (error as Error).message });
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
          [StatusCodes.UNPROCESSABLE_ENTITY]: errorResponseSchema,
        },
        detail: {
          tags: ['Diagnostics'],
          summary: 'Conclui o diagnóstico de uma OS',
          description:
            'O mecânico informa os itens reais encontrados, que podem diferir do que o cliente pediu. Publica evt.workshop.diagnostic-completed para o Billing emitir o orçamento final.',
        },
      },
    )
    .post(
      '/:serviceOrderId/failure',
      async ({ params, body, status }) => {
        try {
          const queueItem = await failDiagnostic.execute({
            serviceOrderId: params.serviceOrderId,
            ...body,
          });

          return {
            serviceOrderId: queueItem.serviceOrderId,
            status: queueItem.status,
            reason: body.reason,
            detail: body.detail,
            failedAt: queueItem.failedAt?.toISOString() ?? '',
          };
        } catch (error) {
          const code = executionErrorStatus(error);

          if (code) {
            return status(code, { message: (error as Error).message });
          }

          throw error;
        }
      },
      {
        params: diagnosticParamsSchema,
        body: failDiagnosticBodySchema,
        response: {
          [StatusCodes.OK]: failureResponseSchema,
          [StatusCodes.NOT_FOUND]: errorResponseSchema,
          [StatusCodes.CONFLICT]: errorResponseSchema,
          [StatusCodes.UNPROCESSABLE_ENTITY]: errorResponseSchema,
        },
        detail: {
          tags: ['Diagnostics'],
          summary: 'Registra que o diagnóstico de uma OS falhou',
          description:
            'O mecânico conclui que não dá para seguir (ex.: UNREPAIRABLE). Leva a OS a FAILED e publica evt.workshop.diagnostic-failed para o orquestrador compensar.',
        },
      },
    );
