import assert from 'node:assert/strict';
import {
  Given,
  When,
  Then,
  setWorldConstructor,
  type IWorldOptions,
  World,
} from '@cucumber/cucumber';
import { AbortExecutionUseCase } from '../../src/application/use-cases/execution/abort-execution';
import { CompleteDiagnosticUseCase } from '../../src/application/use-cases/execution/complete-diagnostic';
import { CompleteExecutionItemsUseCase } from '../../src/application/use-cases/execution/complete-execution-items';
import { FailDiagnosticUseCase } from '../../src/application/use-cases/execution/fail-diagnostic';
import { FailExecutionUseCase } from '../../src/application/use-cases/execution/fail-execution';
import { StartDiagnosticUseCase } from '../../src/application/use-cases/execution/start-diagnostic';
import { StartExecutionUseCase } from '../../src/application/use-cases/execution/start-execution';
import type { OutgoingEvent } from '../../src/application/ports/event-publisher';
import type { ExecutionLog } from '../../src/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '../../src/domain/execution/entities/execution-queue-item';
import type { ExecutionStatus } from '../../src/domain/execution/types/execution-status';
import type { ExecutionLogRepository } from '../../src/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '../../src/domain/execution/repositories/execution-queue-repository';
import type { ExecutionMetrics } from '../../src/application/ports/execution-metrics';
import type { EventPublisher } from '../../src/application/ports/event-publisher';

const serviceOrderId = 'ordem-bdd-1';
const serviceIds = ['servico-1', 'servico-2'];

class ScenarioWorld extends World {
  readonly orders = new Map<string, ExecutionQueueItem>();
  readonly events: OutgoingEvent[] = [];
  readonly logs: ExecutionLog[] = [];
  failure?: unknown;

  readonly queue = {
    create: async (item: ExecutionQueueItem) => {
      this.orders.set(item.serviceOrderId, item);
      return item;
    },
    findByServiceOrderId: async (id: string) => this.orders.get(id) ?? null,
    findByStatus: async (_status: ExecutionStatus) => [],
    update: async (item: ExecutionQueueItem) => {
      this.orders.set(item.serviceOrderId, item);
      return item;
    },
    countByStatus: async () => ({}),
  } satisfies ExecutionQueueRepository;

  readonly history = {
    append: async (log: ExecutionLog) => {
      this.logs.push(log);
      return log;
    },
    findByServiceOrderId: async (_id: string) => this.logs,
  } satisfies ExecutionLogRepository;

  readonly publisher = {
    publish: async (event: OutgoingEvent) => {
      this.events.push(event);
    },
  } satisfies EventPublisher;

  readonly metrics: ExecutionMetrics = {
    diagnosticFinished: () => {},
    executionFinished: () => {},
    aborted: () => {},
  };

  readonly startDiagnostic = new StartDiagnosticUseCase(
    this.queue,
    this.history,
  );
  readonly completeDiagnostic = new CompleteDiagnosticUseCase(
    this.queue,
    this.history,
    this.publisher,
    this.metrics,
  );
  readonly failDiagnostic = new FailDiagnosticUseCase(
    this.queue,
    this.history,
    this.publisher,
    this.metrics,
  );
  readonly startExecution = new StartExecutionUseCase(this.queue, this.history);
  readonly completeItems = new CompleteExecutionItemsUseCase(
    this.queue,
    this.history,
    this.publisher,
    this.metrics,
  );
  readonly failExecution = new FailExecutionUseCase(
    this.queue,
    this.history,
    this.publisher,
    this.metrics,
  );
  readonly abortExecution = new AbortExecutionUseCase(
    this.queue,
    this.history,
    this.publisher,
    this.metrics,
  );

  constructor(options: IWorldOptions) {
    super(options);
  }

  get order(): ExecutionQueueItem {
    const item = this.orders.get(serviceOrderId);
    assert.ok(item, 'A ordem de serviço deveria existir');
    return item;
  }

  get lastEvent(): OutgoingEvent | undefined {
    return this.events.at(-1);
  }

  async invoke(operation: () => Promise<unknown>) {
    this.failure = undefined;
    try {
      await operation();
    } catch (error) {
      this.failure = error;
    }
  }

  async createInDiagnosticOrder() {
    await this.startDiagnostic.execute({
      serviceOrderId,
      correlationId: serviceOrderId,
      vehicle: { id: 'veiculo-1', plate: 'ABC1D23', model: 'Gol 1.6' },
      requestedItems: {
        services: [
          {
            serviceId: serviceIds[0]!,
            description: 'Troca de óleo',
            priceCents: 12000,
          },
        ],
        autoParts: [],
      },
      currency: 'BRL',
    });
  }

  async diagnose(ids = serviceIds) {
    await this.completeDiagnostic.execute({
      serviceOrderId,
      diagnosedBy: 'mecanico-07',
      notes: 'Diagnóstico concluído',
      diagnosedItems: {
        services: ids.map((serviceId) => ({
          serviceId,
          description: `Serviço ${serviceId}`,
          priceCents: 12000,
        })),
        autoParts: [
          {
            autoPartId: 'peca-1',
            description: 'Filtro',
            quantity: 1,
            unitPriceCents: 4500,
          },
        ],
      },
    });
  }

  async execute(ids = serviceIds) {
    await this.startExecution.execute({
      serviceOrderId,
      items: {
        services: ids.map((serviceId) => ({
          serviceId,
          description: `Serviço ${serviceId}`,
        })),
        autoParts: [],
      },
    });
  }
}

setWorldConstructor(ScenarioWorld);

Given(
  'uma ordem de serviço com um serviço solicitado',
  function (this: ScenarioWorld) {},
);

Given('a ordem está em diagnóstico', async function (this: ScenarioWorld) {
  await this.createInDiagnosticOrder();
});

Given(
  'uma ordem de serviço em diagnóstico',
  async function (this: ScenarioWorld) {
    await this.createInDiagnosticOrder();
  },
);

Given(
  'uma ordem de serviço já diagnosticada',
  async function (this: ScenarioWorld) {
    await this.createInDiagnosticOrder();
    await this.diagnose([serviceIds[0]!]);
  },
);

Given(
  'uma ordem de serviço diagnosticada com dois serviços',
  async function (this: ScenarioWorld) {
    await this.createInDiagnosticOrder();
    await this.diagnose();
  },
);

Given(
  'uma ordem de serviço em execução com dois serviços',
  async function (this: ScenarioWorld) {
    await this.createInDiagnosticOrder();
    await this.diagnose();
    await this.execute();
  },
);

Given(
  'uma ordem de serviço em execução com dois serviços e um já concluído',
  async function (this: ScenarioWorld) {
    await this.createInDiagnosticOrder();
    await this.diagnose();
    await this.execute();
    await this.completeItems.execute({
      serviceOrderId,
      serviceIds: [serviceIds[0]!],
    });
  },
);

Given(
  'uma ordem de serviço {string}',
  async function (this: ScenarioWorld, state: string) {
    await this.createInDiagnosticOrder();
    if (state === 'diagnosticada') await this.diagnose([serviceIds[0]!]);
    if (state === 'em execução') {
      await this.diagnose([serviceIds[0]!]);
      await this.execute([serviceIds[0]!]);
    }
    if (state === 'com falha') {
      await this.diagnose([serviceIds[0]!]);
      await this.execute([serviceIds[0]!]);
      await this.failExecution.execute({
        serviceOrderId,
        reason: 'PART_UNAVAILABLE',
      });
    }
  },
);

Given('uma ordem de serviço concluída', async function (this: ScenarioWorld) {
  await this.createInDiagnosticOrder();
  await this.diagnose();
  await this.execute();
  await this.completeItems.execute({ serviceOrderId, serviceIds });
});

Given('uma ordem de serviço abortada', async function (this: ScenarioWorld) {
  await this.createInDiagnosticOrder();
  await this.abortExecution.execute({
    serviceOrderId,
    reason: 'TIMEOUT',
    correlationId: serviceOrderId,
  });
  this.events.length = 0;
});

When(
  'a oficina recebe o comando para iniciar o diagnóstico',
  async function (this: ScenarioWorld) {
    await this.createInDiagnosticOrder();
  },
);

When(
  'a oficina recebe o mesmo comando de diagnóstico duas vezes',
  async function (this: ScenarioWorld) {
    await this.createInDiagnosticOrder();
    await this.createInDiagnosticOrder();
  },
);

When(
  'o mecânico conclui o diagnóstico com um serviço e uma peça encontrados',
  async function (this: ScenarioWorld) {
    await this.diagnose([serviceIds[0]!]);
  },
);

When(
  'o mecânico informa que o veículo não pode ser reparado',
  async function (this: ScenarioWorld) {
    await this.failDiagnostic.execute({
      serviceOrderId,
      reason: 'UNREPAIRABLE',
      detail: 'Dano sem reparo seguro',
    });
  },
);

When(
  'o mecânico tenta concluir o diagnóstico novamente',
  async function (this: ScenarioWorld) {
    await this.invoke(() =>
      this.diagnose([serviceIds[0]!]).then(() => undefined),
    );
  },
);

When(
  'a oficina recebe o comando para iniciar a execução dos serviços aprovados',
  async function (this: ScenarioWorld) {
    await this.execute();
  },
);

When(
  'o mecânico conclui apenas um dos serviços',
  async function (this: ScenarioWorld) {
    await this.completeItems.execute({
      serviceOrderId,
      serviceIds: [serviceIds[0]!],
    });
  },
);

When(
  'o mecânico conclui os dois serviços',
  async function (this: ScenarioWorld) {
    await this.completeItems.execute({ serviceOrderId, serviceIds });
  },
);

When(
  'o mecânico tenta concluir um serviço que não pertence à ordem',
  async function (this: ScenarioWorld) {
    await this.invoke(() =>
      this.completeItems.execute({
        serviceOrderId,
        serviceIds: ['servico-inexistente'],
      }),
    );
  },
);

When(
  'o mecânico informa que um dos serviços pendentes falhou por falta de peça',
  async function (this: ScenarioWorld) {
    await this.failExecution.execute({
      serviceOrderId,
      reason: 'PART_UNAVAILABLE',
      serviceIds: [serviceIds[1]!],
    });
  },
);

When(
  'o mecânico informa uma falha sem indicar serviços específicos',
  async function (this: ScenarioWorld) {
    await this.failExecution.execute({
      serviceOrderId,
      reason: 'PART_UNAVAILABLE',
    });
  },
);

When(
  'o orquestrador solicita o aborto por timeout',
  async function (this: ScenarioWorld) {
    await this.abortExecution.execute({
      serviceOrderId,
      reason: 'TIMEOUT',
      detail: 'Prazo excedido',
      correlationId: serviceOrderId,
    });
  },
);

Then('a ordem fica em diagnóstico', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'IN_DIAGNOSTIC');
});

Then(
  'existe apenas uma ordem de serviço na oficina',
  function (this: ScenarioWorld) {
    assert.equal(this.orders.size, 1);
    assert.equal(
      this.logs.filter((log) => log.event === 'diagnostic-started').length,
      1,
    );
  },
);

Then('a ordem fica diagnosticada', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'DIAGNOSED');
});

Then(
  'o orquestrador recebe os itens encontrados com os preços em centavos e a moeda',
  function (this: ScenarioWorld) {
    assert.equal(
      this.lastEvent?.eventType,
      'evt.workshop.diagnostic-completed',
    );
    assert.deepEqual(this.lastEvent?.data, {
      serviceOrderId,
      diagnosedItems: {
        services: [
          {
            serviceId: serviceIds[0],
            description: `Serviço ${serviceIds[0]}`,
            priceCents: 12000,
          },
        ],
        autoParts: [
          {
            autoPartId: 'peca-1',
            description: 'Filtro',
            quantity: 1,
            unitPriceCents: 4500,
          },
        ],
      },
      notes: 'Diagnóstico concluído',
      diagnosedBy: 'mecanico-07',
      currency: 'BRL',
    });
  },
);

Then('a ordem fica com falha', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'FAILED');
});

Then(
  'o orquestrador recebe a falha de diagnóstico com o motivo informado',
  function (this: ScenarioWorld) {
    assert.equal(this.lastEvent?.eventType, 'evt.workshop.diagnostic-failed');
    assert.equal(this.lastEvent?.data.reason, 'UNREPAIRABLE');
  },
);

Then('a oficina rejeita a conclusão', function (this: ScenarioWorld) {
  assert.ok(this.failure);
});

Then(
  'nenhum novo evento de diagnóstico é enviado',
  function (this: ScenarioWorld) {
    assert.equal(
      this.events.filter(
        (event) => event.eventType === 'evt.workshop.diagnostic-completed',
      ).length,
      1,
    );
  },
);

Then('a ordem fica em execução', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'IN_EXECUTION');
});

Then('a ordem continua em execução', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'IN_EXECUTION');
});

Then(
  'o orquestrador ainda não recebe a conclusão da execução',
  function (this: ScenarioWorld) {
    assert.equal(
      this.events.some(
        (event) => event.eventType === 'evt.workshop.execution-completed',
      ),
      false,
    );
  },
);

Then('a ordem fica concluída', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'COMPLETED');
});

Then(
  'o orquestrador recebe a conclusão com o tempo de cada serviço',
  function (this: ScenarioWorld) {
    assert.equal(this.lastEvent?.eventType, 'evt.workshop.execution-completed');
    const completedItems = this.lastEvent?.data.completedItems as {
      serviceId: string;
      executionTimeMs: number;
    }[];
    assert.deepEqual(
      completedItems.map((item) => item.serviceId),
      serviceIds,
    );
    assert.ok(
      completedItems.every((item) => typeof item.executionTimeMs === 'number'),
    );
  },
);

Then(
  'a oficina rejeita a conclusão do serviço',
  function (this: ScenarioWorld) {
    assert.ok(this.failure);
  },
);

Then(
  'o orquestrador recebe somente o serviço afetado',
  function (this: ScenarioWorld) {
    assert.equal(this.lastEvent?.eventType, 'evt.workshop.execution-failed');
    assert.deepEqual(this.lastEvent?.data.failedItems, [
      { serviceId: serviceIds[1] },
    ]);
  },
);

Then(
  'o orquestrador recebe todos os serviços ainda pendentes como afetados',
  function (this: ScenarioWorld) {
    assert.deepEqual(this.lastEvent?.data.failedItems, [
      { serviceId: serviceIds[1] },
    ]);
  },
);

Then('a ordem fica abortada', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'ABORTED');
});

Then(
  'o orquestrador recebe a confirmação do aborto',
  function (this: ScenarioWorld) {
    assert.equal(this.lastEvent?.eventType, 'evt.workshop.execution-aborted');
  },
);

Then('a ordem continua concluída', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'COMPLETED');
});

Then('a ordem continua abortada', function (this: ScenarioWorld) {
  assert.equal(this.order.status, 'ABORTED');
});

Then('nenhum evento de aborto é enviado', function (this: ScenarioWorld) {
  assert.equal(
    this.events.some(
      (event) => event.eventType === 'evt.workshop.execution-aborted',
    ),
    false,
  );
});

Then('nenhum novo evento de aborto é enviado', function (this: ScenarioWorld) {
  assert.equal(
    this.events.some(
      (event) => event.eventType === 'evt.workshop.execution-aborted',
    ),
    false,
  );
});
