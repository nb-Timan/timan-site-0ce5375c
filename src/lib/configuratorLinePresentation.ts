import type { LineItem } from '@/types/configurator';

export function configuratorLineDescription(item: LineItem): string {
  return (item.description || item.txt.replace(/^\s*-\s*/, '')).trim();
}

export function configuratorCartLineDescription(item: LineItem): string {
  const quantity = configuratorLineQuantity(item);
  return item.description && quantity > 1 ? `${item.txt} x${quantity}` : item.txt;
}

export function configuratorLineQuantity(item: LineItem): number {
  return Math.max(1, item.quantity || 1);
}

export function configuratorLineUnitPrice(item: LineItem): number {
  const quantity = configuratorLineQuantity(item);
  return Number.isFinite(item.unitPrice) ? item.unitPrice! : item.price / quantity;
}
