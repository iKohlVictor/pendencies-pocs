import { InvalidValueError } from '../../shared/domain/domain-error.js';

/**
 * Catalog of pendency types. A type predefines the pendency's name and the
 * workflow it starts with. Which flow (and version) it actually uses can be
 * changed at runtime: see PendencyTypesService.
 */
export const PENDENCY_TYPES = {
  missing_invoice: { name: 'Missing invoice', flow: 'standard' },
  unsigned_contract: { name: 'Unsigned contract', flow: 'standard' },
  registration_update: { name: 'Registration update', flow: 'direct' },
  /** Needs a payment due date: within 48h it also goes through payment scheduling. */
  payment: { name: 'Payment', flow: 'payment' },
} as const satisfies Record<string, { name: string; flow: string }>;

export type PendencyTypeId = keyof typeof PENDENCY_TYPES;

export function parsePendencyType(value: string | undefined): PendencyTypeId {
  if (value !== undefined && Object.hasOwn(PENDENCY_TYPES, value)) return value as PendencyTypeId;
  throw new InvalidValueError('type', value, Object.keys(PENDENCY_TYPES));
}
