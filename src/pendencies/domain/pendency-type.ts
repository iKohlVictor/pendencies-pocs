import { InvalidValueError } from '../../shared/domain/domain-error.js';
import type { PendencyFlowId } from './pendency.machine.js';

/**
 * Catalog of pendency types. A type predefines the pendency's name and which
 * workflow it follows. Hard-coded here; in a real system this is a table.
 */
export const PENDENCY_TYPES = {
  missing_invoice: { name: 'Missing invoice', flow: 'standard' },
  unsigned_contract: { name: 'Unsigned contract', flow: 'standard' },
  registration_update: { name: 'Registration update', flow: 'direct' },
} as const satisfies Record<string, { name: string; flow: PendencyFlowId }>;

export type PendencyTypeId = keyof typeof PENDENCY_TYPES;

export function parsePendencyType(value: string | undefined): PendencyTypeId {
  if (value !== undefined && Object.hasOwn(PENDENCY_TYPES, value)) return value as PendencyTypeId;
  throw new InvalidValueError('type', value, Object.keys(PENDENCY_TYPES));
}

export function listPendencyTypes() {
  return Object.entries(PENDENCY_TYPES).map(([id, def]) => ({ id, ...def }));
}
