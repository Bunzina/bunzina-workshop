import { Money } from '@/domain/core/value-objects/money';
import { ExecutionItem } from '@/domain/execution/entities/execution-item';
import { ExecutionItemKind } from '@/domain/execution/types/execution-item-kind';

export interface PricedItemsInput {
  services: {
    serviceId: string;
    description?: string;
    priceCents: number;
  }[];
  autoParts: {
    autoPartId: string;
    description?: string;
    quantity: number;
    unitPriceCents: number;
  }[];
}

export const toExecutionItems = (
  items: PricedItemsInput,
  currency: string,
): ExecutionItem[] => {
  const services = items.services.map(
    (service) =>
      new ExecutionItem({
        kind: ExecutionItemKind.SERVICE,
        referenceId: service.serviceId,
        description: service.description,
        unitPrice: new Money(service.priceCents, currency),
      }),
  );

  const autoParts = items.autoParts.map(
    (autoPart) =>
      new ExecutionItem({
        kind: ExecutionItemKind.AUTO_PART,
        referenceId: autoPart.autoPartId,
        description: autoPart.description,
        quantity: autoPart.quantity,
        unitPrice: new Money(autoPart.unitPriceCents, currency),
      }),
  );

  return [...services, ...autoParts];
};

export const toPricedItems = (items: ExecutionItem[]): PricedItemsInput => ({
  services: items
    .filter((item) => item.kind === ExecutionItemKind.SERVICE)
    .map((item) => ({
      serviceId: item.referenceId,
      description: item.description,
      priceCents: item.unitPrice?.amountCents ?? 0,
    })),
  autoParts: items
    .filter((item) => item.kind === ExecutionItemKind.AUTO_PART)
    .map((item) => ({
      autoPartId: item.referenceId,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPrice?.amountCents ?? 0,
    })),
});
