import Elysia from 'elysia';
import { StatusCodes } from 'http-status-codes';
import type { CompleteExecutionItems } from '@/application/use-cases/execution/complete-execution-items';
import {
  ExecutionItemNotFoundError,
  ExecutionNotFoundError,
  InvalidExecutionStatusError,
} from '@/domain/execution/errors/execution-errors';
import { errorResponseSchema } from './schemas/complete-diagnostic-schema';
import {
  completeExecutionItemsBodySchema,
  executionParamsSchema,
  executionResponseSchema,
} from './schemas/complete-execution-items-schema';

export const makeExecutionRoutes = (
  completeExecutionItems: CompleteExecutionItems,
) =>
  new Elysia({ prefix: '/executions' }).patch(
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
        if (error instanceof ExecutionNotFoundError) {
          return status(StatusCodes.NOT_FOUND, { message: error.message });
        }

        if (error instanceof ExecutionItemNotFoundError) {
          return status(StatusCodes.UNPROCESSABLE_ENTITY, {
            message: error.message,
          });
        }

        if (error instanceof InvalidExecutionStatusError) {
          return status(StatusCodes.CONFLICT, { message: error.message });
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
  );
