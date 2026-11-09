import { HttpError } from '../../middleware/errors.js';

export function body(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) throw new HttpError(400, 'Invalid request body');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > maximum) {
    throw new HttpError(400, `${label} must contain 1 to ${maximum} characters`);
  }
  return value.trim();
}
export function id(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 4294967295) {
    throw new HttpError(400, 'Invalid resource ID');
  }
  return Number(value);
}
export const MAX_QUANTITY = 999;
export function quantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_QUANTITY) {
    throw new HttpError(400, `quantity must be an integer from 1 to ${MAX_QUANTITY}`);
  }
  return value;
}
export function productId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 4294967295) {
    throw new HttpError(400, 'Invalid product ID');
  }
  return value;
}
