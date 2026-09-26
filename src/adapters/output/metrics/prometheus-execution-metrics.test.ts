import { describe, expect, it } from 'bun:test';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { getMetrics } from '@/infrastructure/observability/metrics';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import { PrometheusExecutionMetrics } from './prometheus-execution-metrics';

const metrics = new PrometheusExecutionMetrics();

const sampleOf = async (name: string, outcome: string) => {
  const line = (await getMetrics())
    .split('\n')
    .find((entry) => entry.startsWith(`${name}{outcome="${outcome}"}`));

  return Number(line?.split(' ').at(-1) ?? 0);
};

describe('PrometheusExecutionMetrics', () => {
  it('measures a diagnostic from the queue entry to the diagnosis', async () => {
    const before = await sampleOf(
      'bunzina_workshop_diagnostic_duration_seconds_sum',
      'completed',
    );

    metrics.diagnosticFinished(
      makeExecutionQueueItem({
        status: ExecutionStatus.DIAGNOSED,
        enqueuedAt: new Date('2026-09-17T16:00:00.000Z'),
        diagnosedAt: new Date('2026-09-17T16:30:00.000Z'),
      }),
    );

    expect(
      await sampleOf(
        'bunzina_workshop_diagnostic_duration_seconds_sum',
        'completed',
      ),
    ).toBe(before + 1800);
  });

  it('measures a failed diagnostic until the failure', async () => {
    const before = await sampleOf(
      'bunzina_workshop_diagnostic_duration_seconds_count',
      'failed',
    );

    metrics.diagnosticFinished(
      makeExecutionQueueItem({
        status: ExecutionStatus.FAILED,
        enqueuedAt: new Date('2026-09-17T16:00:00.000Z'),
        failedAt: new Date('2026-09-17T16:10:00.000Z'),
      }),
    );

    expect(
      await sampleOf(
        'bunzina_workshop_diagnostic_duration_seconds_count',
        'failed',
      ),
    ).toBe(before + 1);
  });

  it('measures an execution from its start to its completion', async () => {
    const before = await sampleOf(
      'bunzina_workshop_execution_duration_seconds_sum',
      'completed',
    );

    metrics.executionFinished(
      makeExecutionQueueItem({
        status: ExecutionStatus.COMPLETED,
        startedAt: new Date('2026-09-17T14:30:00.000Z'),
        completedAt: new Date('2026-09-17T16:00:00.000Z'),
      }),
    );

    expect(
      await sampleOf(
        'bunzina_workshop_execution_duration_seconds_sum',
        'completed',
      ),
    ).toBe(before + 5400);
  });

  it('measures a failed execution until the failure', async () => {
    const before = await sampleOf(
      'bunzina_workshop_execution_duration_seconds_count',
      'failed',
    );

    metrics.executionFinished(
      makeExecutionQueueItem({
        status: ExecutionStatus.FAILED,
        startedAt: new Date('2026-09-17T14:30:00.000Z'),
        failedAt: new Date('2026-09-17T15:00:00.000Z'),
      }),
    );

    expect(
      await sampleOf(
        'bunzina_workshop_execution_duration_seconds_count',
        'failed',
      ),
    ).toBe(before + 1);
  });

  it('skips an execution that never recorded its start', async () => {
    const before = await sampleOf(
      'bunzina_workshop_execution_duration_seconds_count',
      'completed',
    );

    metrics.executionFinished(
      makeExecutionQueueItem({ status: ExecutionStatus.COMPLETED }),
    );

    expect(
      await sampleOf(
        'bunzina_workshop_execution_duration_seconds_count',
        'completed',
      ),
    ).toBe(before);
  });

  it('skips a diagnostic that has not ended', async () => {
    const before = await sampleOf(
      'bunzina_workshop_diagnostic_duration_seconds_count',
      'completed',
    );

    metrics.diagnosticFinished(makeExecutionQueueItem());

    expect(
      await sampleOf(
        'bunzina_workshop_diagnostic_duration_seconds_count',
        'completed',
      ),
    ).toBe(before);
  });

  it('counts aborts by their reason', async () => {
    metrics.aborted(
      makeExecutionQueueItem({
        status: ExecutionStatus.ABORTED,
        failureReason: 'PART_UNAVAILABLE',
      }),
    );

    expect(await getMetrics()).toContain(
      'bunzina_workshop_executions_aborted_total{reason="PART_UNAVAILABLE"}',
    );
  });

  it('counts an abort without a reason as unknown', async () => {
    metrics.aborted(
      makeExecutionQueueItem({ status: ExecutionStatus.ABORTED }),
    );

    expect(await getMetrics()).toContain(
      'bunzina_workshop_executions_aborted_total{reason="UNKNOWN"}',
    );
  });
});
