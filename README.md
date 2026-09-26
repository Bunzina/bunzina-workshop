# bunzina-workshop

[![CI](https://github.com/Bunzina/bunzina-workshop/actions/workflows/ci.yml/badge.svg)](https://github.com/Bunzina/bunzina-workshop/actions/workflows/ci.yml)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Bunzina_bunzina-workshop&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Bunzina_bunzina-workshop)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=Bunzina_bunzina-workshop&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Bunzina_bunzina-workshop)

Microsserviço da **oficina** do Bunzina — Fase 4. Recebe as ordens de serviço que o
orquestrador (`bunzina-os`) manda diagnosticar e executar, expõe ao mecânico as ações
de diagnóstico e execução por REST e avisa o orquestrador do resultado por eventos.

Este serviço **nunca publica comando**: só sai `evt.workshop.*`. Quem decide o próximo
passo da saga é o `bunzina-os`.

O contrato das mensagens é o
[events-saga-contracts.md](https://github.com/Bunzina/bunzina/blob/main/docs/contracts/events-saga-contracts.md)
do repositório `bunzina`. Se este README divergir dele, o contrato ganha.

## Arquitetura

Arquitetura hexagonal, com as dependências apontando para dentro
([ADR 0002](https://github.com/Bunzina/bunzina/blob/main/docs/arch/adrs/0002-clean-architecture.md)):

```
                ┌──────────────────── adapters/input ────────────────────┐
  Mecânico ───► │ http/       PATCH /diagnostics/:id, POST .../failure   │
  (REST)        │             PATCH /executions/:id/items, POST .../failure│
  RabbitMQ ───► │ messaging/  cmd.workshop.start-diagnostic | start-execution | abort
                └───────────────────────────┬────────────────────────────┘
                                            ▼
                ┌──────────────── application/use-cases ─────────────────┐
                │ StartDiagnostic · CompleteDiagnostic · FailDiagnostic  │
                │ StartExecution · CompleteExecutionItems · FailExecution│
                │ AbortExecution                                         │
                │        ports: EventPublisher · ExecutionMetrics        │
                └───────────────────────────┬────────────────────────────┘
                                            ▼
                ┌────────────────────── domain ──────────────────────────┐
                │ ExecutionQueueItem (agregado) · ExecutionItem          │
                │ ExecutionLog · Vehicle · Money · ExecutionStatus       │
                │ interfaces de repositório                              │
                └────────────────────────────────────────────────────────┘
                                            ▲
                ┌─────────── adapters/output + infrastructure ───────────┐
                │ MongoDB (repositórios, mapper, idempotência)           │
                │ RabbitMQ (publisher com traceparent) · Prometheus      │
                └────────────────────────────────────────────────────────┘
```

| Pasta | O que tem |
| --- | --- |
| `src/domain` | Entidades, value objects, status, erros e as **interfaces** de repositório. Não importa nada de fora |
| `src/application` | Casos de uso e portas (`EventPublisher`, `ExecutionMetrics`) |
| `src/adapters/input` | Rotas HTTP (Elysia + Zod) e handlers dos comandos |
| `src/adapters/output` | Publicação no RabbitMQ e métricas Prometheus |
| `src/infrastructure` | Mongo, cliente de mensageria (envelope, consumer, publisher), observabilidade |
| `src/api` | Composição: `server.ts` (HTTP) e `messaging.ts` (consumer) |

### Ciclo de vida de uma OS na oficina

```
cmd.workshop.start-diagnostic ──► IN_DIAGNOSTIC ──PATCH /diagnostics/:id──► DIAGNOSED
                                      │                                        │
                   POST /diagnostics/:id/failure              cmd.workshop.start-execution
                                      ▼                                        ▼
                                   FAILED ◄──POST /executions/:id/failure── IN_EXECUTION
                                      │                                        │
                            cmd.workshop.abort               PATCH /executions/:id/items
                                      ▼                          (último serviço)
                                   ABORTED                                     ▼
                                                                          COMPLETED
```

`cmd.workshop.abort` vale em qualquer status que ainda não terminou **e também em
`FAILED`**: depois de um `execution-failed`, o orquestrador compensa mandando
`abort`, e precisa do `evt.workshop.execution-aborted` de volta antes de pedir o
estorno ao Billing. Sobre uma OS `COMPLETED` ou já `ABORTED`, o abort não faz nada.

### Mensagens

| Entra (comando) | Efeito |
| --- | --- |
| `cmd.workshop.start-diagnostic` | Cria a OS na fila em `IN_DIAGNOSTIC` com os itens pedidos pelo cliente |
| `cmd.workshop.start-execution` | Move para `IN_EXECUTION` com os itens aprovados e começa a contar o tempo de cada um |
| `cmd.workshop.abort` | Move para `ABORTED` e registra o motivo |

| Sai (evento) | Quando |
| --- | --- |
| `evt.workshop.diagnostic-completed` | Mecânico concluiu o diagnóstico, com os itens reais e preços |
| `evt.workshop.diagnostic-failed` | Mecânico concluiu que não dá para seguir (ex.: `UNREPAIRABLE`) |
| `evt.workshop.execution-completed` | O último serviço foi concluído. Leva `executionTimeMs` de cada serviço |
| `evt.workshop.execution-failed` | A execução falhou (ex.: `PART_UNAVAILABLE`), com os serviços afetados |
| `evt.workshop.execution-aborted` | A OS foi abortada a pedido do orquestrador |

Todo comando passa pela guarda de idempotência (`processed_events`): um redelivery do
RabbitMQ com o mesmo `eventId` é confirmado sem repetir o efeito.

## API

A documentação interativa fica em **`/swagger`** (JSON em `/swagger/json`). Localmente:
<http://localhost:3000/swagger>.

| Rota | Faz |
| --- | --- |
| `PATCH /diagnostics/:serviceOrderId` | Conclui o diagnóstico com os itens reais |
| `POST /diagnostics/:serviceOrderId/failure` | Falha o diagnóstico com um `reason` do contrato |
| `PATCH /executions/:serviceOrderId/items` | Conclui serviços; o último publica `execution-completed` |
| `POST /executions/:serviceOrderId/failure` | Falha a execução e dispara a compensação |
| `GET /health` · `GET /ready` · `GET /metrics` | Liveness, readiness (pinga o Mongo) e Prometheus |

Respostas de erro: `404` quando a OS não está na fila, `409` quando o status não
permite a ação e `422` para corpo inválido ou serviço que não pertence à OS.

### Cenário da demonstração: falha com estorno

Com a OS em execução, uma chamada provoca a falha que faz o orquestrador abortar e
estornar o pagamento:

```bash
curl -X POST http://localhost:3000/executions/<serviceOrderId>/failure \
  -H 'Content-Type: application/json' \
  -d '{"reason":"PART_UNAVAILABLE","detail":"Correia dentada sem estoque no fornecedor"}'
```

Sem `services` no corpo, todos os serviços ainda pendentes entram em `failedItems`.
Para apontar só alguns: `"services": [{ "serviceId": "<uuid>" }]`.

## Modelo de documentos (MongoDB)

Três coleções, com os índices criados por `scripts/ensure-indexes.ts`:

| Coleção | Índices | Guarda |
| --- | --- | --- |
| `execution_queue` | `serviceOrderId` (único), `status`, `enqueuedAt` | Um documento por OS: status, itens e marcos de tempo |
| `execution_logs` | `serviceOrderId`, `occurredAt` (desc) | Histórico append-only de cada passo |
| `processed_events` | `{ eventId, consumer }` (único) | Idempotência dos comandos consumidos |

**`execution_queue`** — o agregado inteiro num documento. Os itens ficam embutidos em
três listas, porque cada fase tem a sua versão deles: o que o cliente pediu, o que o
mecânico encontrou e o que foi aprovado para execução.

```jsonc
{
  "id": "0199...",                       // id do domínio; o _id do Mongo não sai do repositório
  "serviceOrderId": "7f0c...",
  "correlationId": "7f0c...",            // correlação da saga, repassada nos eventos
  "vehicle": { "id": "c1a2...", "plate": "ABC1D23", "model": "Gol 1.6" },
  "status": "IN_EXECUTION",
  "currency": "BRL",
  "requestedItems": [
    { "id": "...", "kind": "SERVICE", "referenceId": "5e1d...", "description": "Troca de correia",
      "quantity": 1, "unitPriceCents": 12000, "totalPriceCents": 12000, "isCompleted": false }
  ],
  "diagnosedItems": [
    { "id": "...", "kind": "SERVICE", "referenceId": "5e1d...", "description": "Troca de correia",
      "quantity": 1, "unitPriceCents": 38000, "totalPriceCents": 38000, "isCompleted": false },
    { "id": "...", "kind": "AUTO_PART", "referenceId": "9a4b...", "description": "Filtro de óleo",
      "quantity": 1, "unitPriceCents": 4500, "totalPriceCents": 4500, "isCompleted": false }
  ],
  "executionItems": [
    { "id": "...", "kind": "SERVICE", "referenceId": "5e1d...", "quantity": 1,
      "isCompleted": true, "startedAt": "2026-09-17T14:30:00Z",
      "finishedAt": "2026-09-17T16:00:00Z", "executionTimeMs": 5400000 }
  ],
  "notes": "Correia dentada com folga acima do limite",
  "diagnosedBy": "mecanico-07",
  "failureReason": null, "failureDetail": null,   // preenchidos em FAILED / ABORTED
  "enqueuedAt": "2026-09-17T13:00:00Z",
  "diagnosedAt": "2026-09-17T13:40:00Z",
  "startedAt": "2026-09-17T14:30:00Z",
  "completedAt": null, "failedAt": null, "abortedAt": null,
  "updatedAt": "2026-09-17T16:00:00Z"
}
```

Dinheiro sempre em centavos inteiros com `currency` ao lado. Datas em UTC.

**`execution_logs`** — um documento por acontecimento, nunca atualizado. É a narrativa
"diagnosticou, começou, falhou, foi abortado" que sustenta a demonstração.

```jsonc
{
  "id": "0199...",
  "serviceOrderId": "7f0c...",
  "event": "execution-failed",        // diagnostic-started, diagnostic-completed, execution-started, ...
  "status": "FAILED",
  "reason": "PART_UNAVAILABLE",
  "detail": "Correia dentada sem estoque no fornecedor",
  "metadata": { "failedItems": [{ "serviceId": "5e1d..." }] },
  "occurredAt": "2026-09-17T15:00:00Z"
}
```

**`processed_events`** — `{ "eventId": "0199...", "consumer": "bunzina-workshop" }`. A
inserção que bate no índice único (erro `11000`) significa "já processado".

### Por que um banco não relacional aqui

A decisão está na
[ADR 0014](https://github.com/Bunzina/bunzina/blob/main/docs/arch/adrs/0014-mongodb-workshop.md).
Em resumo:

- **O dado é um documento.** A OS na oficina é lida e gravada inteira, sempre pela
  chave `serviceOrderId`. As três listas de itens mudam de forma a cada fase: com preço
  no diagnóstico, sem preço na execução, com tempos só depois de concluído. Em tabelas,
  isso viraria três tabelas filhas com colunas quase sempre nulas, ou uma coluna `jsonb`,
  que é o documento com outro nome.
- **Não há relação a manter.** Veículo e itens são cópias válidas no momento do comando,
  não chaves estrangeiras. A fonte da verdade deles está no `bunzina-os`.
- **O histórico é append-only.** `execution_logs` só recebe inserções, com `metadata`
  livre por tipo de evento. Esse é o caso de uso natural de uma coleção.
- **Hospedagem fora do cluster.** O MongoDB Atlas M0 é gratuito e tira do EKS um
  workload com estado, liberando cota do Learner Lab para o RabbitMQ.

## Observabilidade

`GET /metrics` expõe, além das métricas HTTP e de mensageria do template:

| Métrica | Tipo | Labels |
| --- | --- | --- |
| `bunzina_workshop_execution_queue_items` | Gauge | `status` — contado no Mongo a cada scrape |
| `bunzina_workshop_diagnostic_duration_seconds` | Histogram | `outcome` (`completed`/`failed`), da entrada na fila ao fim do diagnóstico |
| `bunzina_workshop_execution_duration_seconds` | Histogram | `outcome`, do início ao fim da execução |
| `bunzina_workshop_executions_aborted_total` | Counter | `reason` |

As rotas com identificador são agrupadas (`/executions/:id/items`) para não explodir a
cardinalidade. O gauge da fila vem do banco, e não de um contador em memória, para
continuar certo com várias réplicas e depois de um restart. Por isso o dashboard deve
usar `max`, e não `sum`, entre as réplicas.

O trace chega pelo header `traceparent` da mensagem AMQP e é repassado nos eventos
publicados (OpenTelemetry → Alloy).

## Como rodar

Pré-requisitos: [Bun](https://bun.sh) e Docker.

```bash
bun install
cp .env.example .env
docker compose up -d mongo rabbitmq
bun run ensure-indexes
bun run start:dev          # http://localhost:3000/swagger
```

O painel do RabbitMQ fica em <http://localhost:15672> (`bunzina` / `bunzina`), onde
aparecem a fila `bunzina-workshop.inbox` e a DLQ.

Para publicar um comando à mão, use a exchange `bunzina.events` com a routing key igual
ao `eventType` (por exemplo, `cmd.workshop.start-diagnostic`) e um envelope do contrato.

| Comando | Faz |
| --- | --- |
| `bun test` | Testes, sem banco nem broker: repositórios e canal são injetados |
| `bun run test:ci` | Testes com o gate de cobertura de 80% do CI |
| `bun run lint` · `bun run fmt:check` | oxlint e oxfmt |

## Cobertura de testes

O CI (`test/coverage`) reprova o PR abaixo de **80%** de linhas, funções, statements e
branches (`bunfig.ci.toml`), e o SonarCloud recebe o `lcov` para o quality gate.

Resultado do `bun run test:ci` em 26/09/2026 — **312 testes, 0 falhas**:

```
File                                          | % Funcs | % Lines
----------------------------------------------|---------|--------
All files                                     |   99.50 |   99.89
 src/adapters/input/http/*                    |  100.00 |  100.00
 src/adapters/input/messaging/*               |  100.00 |  100.00
 src/application/use-cases/execution/*        |  100.00 |  100.00
 src/domain/**                                |  100.00 |  100.00
 src/infrastructure/repositories/**           |  100.00 |  100.00
 src/infrastructure/observability/metrics.ts  |  100.00 |  100.00
 src/api/server.ts                            |   95.24 |   95.24
```

As linhas que faltam no `server.ts` são o bootstrap do processo (`import.meta.main` e o
tracing ligado só com endpoint OTLP).

## Deploy

O `deploy-k8s.yml` roda a cada push na `main`: testes → verificação dos secrets →
`ensure-indexes` no Atlas → build e push no ECR → `helm upgrade --install` no EKS.

O chart `charts/bunzina-workshop-chart` consome o `app-chart` do `bunzina-chart` por OCI,
com HPA, ServiceMonitor e probes (`/health` e `/ready`). O `database` do chart fica
desligado: o banco é o Atlas.

A ingress está desligada (`ingress.enabled: false`), porque esta é uma API interna da
oficina. Para alcançá-la no cluster:

```bash
kubectl port-forward -n bunzina svc/bunzina-workshop 3000:80
# http://localhost:3000/swagger
```

Para expor, basta `--set app-chart.app.ingress.enabled=true` no deploy.

### O que precisa existir antes do primeiro deploy

| Item | Onde |
| --- | --- |
| `MONGODB_URI` | Secret do repositório (connection string do Atlas) |
| `RABBITMQ_URL` | Secret do repositório (`amqp://user:pass@<host do RabbitMQ no cluster>:5672`) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_ACCOUNT_ID` | Secrets. As do Learner Lab expiram a cada sessão |
| `SONAR_TOKEN` e o projeto `Bunzina_bunzina-workshop` | SonarCloud. Sem o token, o job do Sonar é pulado |
| Acesso de rede ao Atlas | Network Access do Atlas: IP de saída do EKS **e** dos runners do GitHub Actions |

O último item é o que costuma travar. O `ensure-indexes` roda **dentro do runner do
GitHub**, não no cluster, e os runners hospedados não têm IP fixo. Com só o IP do EKS
liberado, o deploy falha antes de chegar no Helm. Para o M0 da demonstração, a saída
prática é liberar `0.0.0.0/0` com usuário e senha fortes.

Se faltar algum secret, o job `Check deploy secrets` falha logo no começo e lista os
que estão ausentes.
