import { schedule, type Schedule } from './api';

export function createConfirmation(publish: (message: string | null) => void, later: Schedule = schedule) {
  let generation = 0, clearTimer: (() => void) | undefined;
  function cancel() { generation++; clearTimer?.(); clearTimer = undefined; }
  return {
    show(productName: string, listName: string) {
      cancel(); const own = generation;
      publish(`✓ ${productName} added to ${listName}`);
      clearTimer = later(() => { if (own === generation) { clearTimer = undefined; publish(null); } }, 2500);
    },
    clear() { cancel(); publish(null); }, cancel,
  };
}
