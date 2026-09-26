import Elysia from 'elysia';
import { StatusCodes } from 'http-status-codes';
import type { CompleteExecutionItems } from '@/application/use-cases/execution/complete-execution-items';
import type { FailExecution } from '@/application/use-cases/execution/fail-execution';
import { executionErrorStatus } from './execution-error-status';
import { errorResponseSchema } from './schemas/complete-diagnostic-schema';
import {
  completeExecutionItemsBodySchema,
  executionParamsSchema,
  executionResponseSchema,
} from './schemas/complete-execution-items-schema';
import {
  executionFailureResponseSchema,
  failExecutionBodySchema,
} from './schemas/failure-schema';

export const makeExecutionRoutes = (
  completeExecutionItems: CompleteExecutionItems,
  failExecution: FailExecution,
) =>
  new Elysia({ prefix: '/executions' })
    .patch(
      '/:serviceOrderId/items',
      async ({ params, body, status }) => {
        try {
          const queueItem = await completeExecutionItems.execute({
            serviceOrderId: params.serviceOrderId,
            serviceIds: body.services.map((service) => service.serviceId),
          });

          return {
            serviceOrderId: queueItem.serviceOrderId,
            status: queueItem.status,
            completedAt: queueItem.completedAt?.toISOString(),
            services: queueItem.services.map((service) => ({
              serviceId: service.referenceId,
              isCompleted: service.isCompleted,
              finishedAt: service.finishedAt?.toISOString(),
              executionTimeMs: service.executionTimeMs,
            })),
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
        params: executionParamsSchema,
        body: completeExecutionItemsBodySchema,
        response: {
          [StatusCodes.OK]: executionResponseSchema,
          [StatusCodes.NOT_FOUND]: errorResponseSchema,
          [StatusCodes.CONFLICT]: errorResponseSchema,
          [StatusCodes.UNPROCESSABLE_ENTITY]: errorResponseSchema,
        },
        detail: {
          tags: ['Executions'],
          summary: 'Conclui itens de execução de uma OS',
          description:
            'O mecânico informa os serviços que terminou. Quando todos os serviços da OS estão concluídos, as peças são dadas como aplicadas e publica evt.workshop.execution-completed com o tempo de execução de cada serviço.',
        },
      },
    )
    .post(
      '/:serviceOrderId/failure',
      async ({ params, body, status }) => {
        try {
          const queueItem = await failExecution.execute({
            serviceOrderId: params.serviceOrderId,
            reason: body.reason,
            detail: body.detail,
            serviceIds: body.services?.map((service) => service.serviceId),
          });

          return {
            serviceOrderId: queueItem.serviceOrderId,
            status: queueItem.status,
            reason: body.reason,
            detail: body.detail,
            failedAt: queueItem.failedAt?.toISOString() ?? '',
            failedItems: queueItem.failedServices.map((service) => ({
              serviceId: service.referenceId,
            })),
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
        params: executionParamsSchema,
        body: failExecutionBodySchema,
        response: {
          [StatusCodes.OK]: executionFailureResponseSchema,
          [StatusCodes.NOT_FOUND]: errorResponseSchema,
          [StatusCodes.CONFLICT]: errorResponseSchema,
          [StatusCodes.UNPROCESSABLE_ENTITY]: errorResponseSchema,
        },
        detail: {
          tags: ['Executions'],
          summary: 'Registra que a execução de uma OS falhou',
          description:
            'Dispara a compensação ao vivo: leva a OS a FAILED e publica evt.workshop.execution-failed. Com reason PART_UNAVAILABLE, o orquestrador aborta a execução e manda o Billing estornar o pagamento. Sem services, todos os serviços ainda pendentes são dados como falhos.',
        },
      },
    );
