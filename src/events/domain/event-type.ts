import type { PendencyTypeId } from '../../pendencies/domain/pendency-type.js';
import { InvalidValueError } from '../../shared/domain/domain-error.js';

/**
 * Catalog of event types. A type predefines the event's name and which
 * pendencies are created together with it. Hard-coded here; in a real system
 * this is a table.
 */
export const EVENT_TYPES = {
  resolve_documentation: {
    name: 'Resolve documentation',
    pendencyTypes: ['missing_invoice', 'unsigned_contract'],
  },
  supplier_onboarding: {
    name: 'Supplier onboarding',
    pendencyTypes: ['registration_update', 'unsigned_contract'],
  },
  /** No predefined pendencies: they are added by hand afterwards. */
  ad_hoc: { name: 'Ad hoc event', pendencyTypes: [] },
} as const satisfies Record<string, { name: string; pendencyTypes: readonly PendencyTypeId[] }>;

export type EventTypeId = keyof typeof EVENT_TYPES;

export function parseEventType(value: string | undefined): EventTypeId {
  if (value !== undefined && Object.hasOwn(EVENT_TYPES, value)) return value as EventTypeId;
  throw new InvalidValueError('type', value, Object.keys(EVENT_TYPES));
}

export function listEventTypes() {
  return Object.entries(EVENT_TYPES).map(([id, def]) => ({ id, ...def }));
}
