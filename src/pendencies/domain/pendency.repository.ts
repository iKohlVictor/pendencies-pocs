import type { Pendency } from './pendency.js';

/** Port. The domain says what it needs; infrastructure decides how. */
export interface PendencyRepository {
  nextId(): Promise<string>;
  findById(id: string): Promise<Pendency | null>;
  findAll(): Promise<Pendency[]>;
  findByEventId(eventId: string): Promise<Pendency[]>;
  /** Must throw ConcurrencyError if the stored version differs from the loaded one. */
  save(pendency: Pendency): Promise<void>;
}

export const PENDENCY_REPOSITORY = Symbol('PendencyRepository');
