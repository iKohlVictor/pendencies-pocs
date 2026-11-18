import type { Pendency, PendencySnapshot } from './pendency.js';

/**
 * Port. The domain says what it needs; infrastructure decides how.
 * Reads return snapshots: rehydrating needs the pendency's flow version,
 * which the application layer resolves.
 */
export interface PendencyRepository {
  nextId(): Promise<string>;
  findById(id: string): Promise<PendencySnapshot | null>;
  findAll(): Promise<PendencySnapshot[]>;
  findByEventId(eventId: string): Promise<PendencySnapshot[]>;
  /** Must throw ConcurrencyError if the stored version differs from the loaded one. */
  save(pendency: Pendency): Promise<void>;
}

export const PENDENCY_REPOSITORY = Symbol('PendencyRepository');
