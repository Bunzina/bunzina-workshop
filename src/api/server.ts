import '@/infrastructure/observability/logger-trace';

import { makeDiagnosticRoutes } from '@/adapters/input/http/diagnostic-routes';
import { makeExecutionRoutes } from '@/adapters/input/http/execution-routes';
import { PrometheusExecutionMetrics } from '@/adapters/output/metrics/prometheus-execution-metrics';
import { RabbitMqEventPublisher } from '@/adapters/output/messaging/rabbitmq-event-publisher';
import { CompleteDiagnosticUseCase } from '@/application/use-cases/execution/complete-diagnostic';
import { CompleteExecutionItemsUseCase } from '@/application/use-cases/execution/complete-execution-items';
import { FailDiagnosticUseCase } from '@/application/use-cases/execution/fail-diagnostic';
import { FailExecutionUseCase } from '@/application/use-cases/execution/fail-execution';
import { getDb } from '@/infrastructure/configs/mongo';
import { ExecutionLogRepository } from '@/infrastructure/repositories/execution/execution-log-repository';
import { ExecutionQueueRepository } from '@/infrastructure/repositories/execution/execution-queue-repository';
import { startMessaging } from './messaging';
import {
  createHttpMetrics,
  getMetrics,
  metricsContentType,
  trackExecutionQueue,
} from '@/infrastructure/observability/metrics';
import { tracing } from '@/infrastructure/observability/tracing';
import openapi from '@elysiajs/openapi';
import Elysia from 'elysia';
import logger from '@lucas-pmelo/logger';
import z from 'zod';

export const app = new Elysia();

if (tracing) {
  app.use(tracing);
}

const httpMetrics = createHttpMetrics();

app.onRequest(({ request }) => {
  if (new URL(request.url).pathname !== '/metrics') {
    httpMetrics.start(request);
  }
});

app.onAfterHandle(({ request, set, responseValue }) => {
  if (new URL(request.url).pathname !== '/metrics') {
    const status =
      responseValue instanceof Response ? responseValue.status : set.status;
    httpMetrics.finish(request, status);
  }
});

app.onError(({ request, set, error }) => {
  if (new URL(request.url).pathname !== '/metrics') {
    const status = (error as { status?: number })?.status ?? set.status ?? 500;
    httpMetrics.finish(request, status);
  }
});

app.use(
  openapi({
    documentation: {
      info: {
        title: 'bunzina-workshop API',
        version: '1.0.0',
        description: 'Microsserviço do Bunzina — Fase 4.',
      },
      tags: [
        { name: 'Health', description: 'Verificação de saúde do serviço' },
        {
          name: 'Diagnostics',
          description: 'Ações do mecânico durante o diagnóstico da OS',
        },
        {
          name: 'Executions',
          description: 'Ações do mecânico durante a execução da OS',
        },
      ],
    },
    path: '/swagger',
    mapJsonSchema: { zod: z.toJSONSchema },
  }),
);

app.get('/health', () => Response.json({ status: 'ok' }), {
  detail: { tags: ['Health'] },
});

app.get('/metrics', async () => {
  return new Response(await getMetrics(), {
    status: 200,
    headers: { 'Content-Type': metricsContentType },
  });
});

app.get('/ready', async ({ set }) => {
  try {
    await checkDependencies();

    return Response.json({ status: 'ready' });
  } catch (cause) {
    logger.error({
      message: `Readiness check failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    });

    set.status = 503;

    return Response.json({ status: 'not_ready' }, { status: 503 });
  }
});

async function checkDependencies(): Promise<void> {
  const db = await getDb();
  await db.command({ ping: 1 });
}

type UseCase<TInput, TOutput> = {
  execute(input: TInput): Promise<TOutput>;
};

const executionMetrics = new PrometheusExecutionMetrics();

const perRequest = <TInput, TOutput>(
  build: (
    queueRepository: ExecutionQueueRepository,
    logRepository: ExecutionLogRepository,
    eventPublisher: RabbitMqEventPublisher,
    metrics: PrometheusExecutionMetrics,
  ) => UseCase<TInput, TOutput>,
): UseCase<TInput, TOutput> => ({
  execute: async (input) => {
    const db = await getDb();

    return build(
      new ExecutionQueueRepository(db),
      new ExecutionLogRepository(db),
      new RabbitMqEventPublisher(),
      executionMetrics,
    ).execute(input);
  },
});

trackExecutionQueue(async () =>
  new ExecutionQueueRepository(await getDb()).countByStatus(),
);

app.use(
  makeDiagnosticRoutes(
    perRequest((...deps) => new CompleteDiagnosticUseCase(...deps)),
    perRequest((...deps) => new FailDiagnosticUseCase(...deps)),
  ),
);
app.use(
  makeExecutionRoutes(
    perRequest((...deps) => new CompleteExecutionItemsUseCase(...deps)),
    perRequest((...deps) => new FailExecutionUseCase(...deps)),
  ),
);

app.get('/', ({ redirect }) => redirect('/swagger'), {
  detail: { hide: true },
});

/* c8 ignore next */
if (import.meta.main) {
  await startMessaging();

  app.listen(3000, () => {
    logger.info({
      message: 'Server is running on http://localhost:3000/swagger',
    });
  });
}
