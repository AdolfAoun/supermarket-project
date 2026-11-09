import type { ListDetails, ListItem } from './private-contracts';

// Apply only a backend-confirmed item to the CURRENT state, rather than replacing
// a captured list snapshot. Unrelated rows retain their identity and newer values.
export function confirmItem(list: ListDetails, item: ListItem): ListDetails {
  const found = list.items.some(row => row.id === item.id);
  return { ...list, items: found ? list.items.map(row => row.id === item.id ? item : row) : [...list.items, item] };
}
export function confirmRemoval(list: ListDetails, itemId: number): ListDetails {
  return { ...list, items: list.items.filter(item => item.id !== itemId) };
}

export interface QuantityDraft { confirmed: number; value: string }
export function syncQuantityDraft(draft: QuantityDraft, confirmed: number): QuantityDraft {
  return draft.confirmed === confirmed ? draft : { confirmed, value: String(confirmed) };
}
