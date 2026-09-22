import { ExecutionItem } from '@/domain/execution/entities/execution-item';
import type { ExecutionItemProps } from '@/domain/execution/entities/execution-item';
import { ExecutionItemKind } from '@/domain/execution/types/execution-item-kind';
import { Money } from '@/domain/core/value-objects/money';

export const makeExecutionItem = (
  override?: Partial<ExecutionItemProps>,
): ExecutionItem =>
  new ExecutionItem({
    id: 'item-id',
    kind: ExecutionItemKind.SERVICE,
    referenceId: 'service-id',
    description: 'Troca de correia',
    unitPrice: new Money(38000),
    ...override,
  });
