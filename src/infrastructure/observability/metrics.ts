import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import logger from '@lucas-pmelo/logger';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';

const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'bunzina_workshop_http_requests_total',
  help: 'Total number of HTTP requests handled by the service.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'bunzina_workshop_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

export const httpRequestsInFlight = new Gauge({
  name: 'bunzina_workshop_http_requests_in_flight',
  help: 'Number of HTTP requests currently being handled.',
  registers: [registry],
});

export const messagesPublishedTotal = new Counter({
  name: 'bunzina_workshop_messages_published_total',
  help: 'Total number of messages published to the broker.',
  labelNames: ['event_type'],
  registers: [registry],
});

export const messagesConsumedTotal = new Counter({
  name: 'bunzina_workshop_messages_consumed_total',
  help: 'Total number of messages consumed from the broker.',
  labelNames: ['event_type', 'result'],
  registers: [registry],
});

export const messageHandlingDurationSeconds = new Histogram({
  name: 'bunzina_workshop_message_handling_duration_seconds',
  help: 'Time spent handling a consumed message, in seconds.',
  labelNames: ['event_type'],
  registers: [registry],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

const WORKSHOP_STAGE_BUCKETS = [
  1, 5, 15, 30, 60, 300, 900, 1800, 3600, 7200, 14400, 28800,
];

export const diagnosticDurationSeconds = new Histogram({
  name: 'bunzina_workshop_diagnostic_duration_seconds',
  help: 'Time from the service order entering the queue to the end of its diagnostic, in seconds.',
  labelNames: ['outcome'],
  registers: [registry],
  buckets: WORKSHOP_STAGE_BUCKETS,
});

export const executionDurationSeconds = new Histogram({
  name: 'bunzina_workshop_execution_duration_seconds',
  help: 'Time from the start of the execution to its end, in seconds.',
  labelNames: ['outcome'],
  registers: [registry],
  buckets: WORKSHOP_STAGE_BUCKETS,
});

export const executionsAbortedTotal = new Counter({
  name: 'bunzina_workshop_executions_aborted_total',
  help: 'Total number of service orders aborted by the orchestrator.',
  labelNames: ['reason'],
  registers: [registry],
});

export type QueueSizeSource = () => Promise<
  Partial<Record<ExecutionStatus, number>>
>;

let queueSizeSource: QueueSizeSource | undefined;

export const trackExecutionQueue = (source: QueueSizeSource | undefined) => {
  queueSizeSource = source;
};

export const executionQueueItems = new Gauge({
  name: 'bunzina_workshop_execution_queue_items',
  help: 'Number of service orders in the workshop queue, by status.',
  labelNames: ['status'],
  registers: [registry],
  async collect() {
    if (!queueSizeSource) {
      return;
    }

    try {
      const counts = await queueSizeSource();

      for (const status of Object.values(ExecutionStatus)) {
        this.set({ status }, counts[status] ?? 0);
      }
    } catch (cause) {
      logger.warn({
        message: `Could not count the execution queue: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  },
});

const getStatusCode = (status: number | string | undefined): string => {
  const statusCode = Number(status);
  return Number.isInteger(statusCode) && statusCode > 0
    ? String(statusCode)
    : '200';
};

const dynamicRoutePatterns: Array<[RegExp, string]> = [
  [/^\/diagnostics\/[^/]+$/, '/diagnostics/:id'],
  [/^\/diagnostics\/[^/]+\/failure$/, '/diagnostics/:id/failure'],
  [/^\/executions\/[^/]+\/items$/, '/executions/:id/items'],
  [/^\/executions\/[^/]+\/failure$/, '/executions/:id/failure'],
];

const UUID_SEGMENT =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export const normalizeRoute = (pathname: string): string => {
  for (const [pattern, route] of dynamicRoutePatterns) {
    if (pattern.test(pathname)) {
      return route;
    }
  }

  return pathname.replace(UUID_SEGMENT, ':id') || '/';
};

const getRequestLabels = (
  request: Request,
  status: number | string | undefined,
) => {
  const url = new URL(request.url);

  return {
    method: request.method,
    route: normalizeRoute(url.pathname),
    status_code: getStatusCode(status),
  };
};

export const createHttpMetrics = () => {
  const requestStartTimes = new WeakMap<Request, number>();

  return {
    start(request: Request) {
      requestStartTimes.set(request, performance.now());
      httpRequestsInFlight.inc();
    },
    finish(request: Request, status: number | string | undefined) {
      const labels = getRequestLabels(request, status);
      const startedAt = requestStartTimes.get(request);
      const durationSeconds = startedAt
        ? (performance.now() - startedAt) / 1000
        : 0;

      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, durationSeconds);
      httpRequestsInFlight.dec();
      requestStartTimes.delete(request);
    },
  };
};

export const metricsContentType = 'text/plain; version=0.0.4; charset=utf-8';

export const getMetrics = async (): Promise<string> => registry.metrics();
