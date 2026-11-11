import type { BusinessEvent } from './business-event.js';

export interface EventRepository {
  nextId(): Promise<string>;
  findById(id: string): Promise<BusinessEvent | null>;
  findAll(): Promise<BusinessEvent[]>;
  /** Must throw ConcurrencyError if the stored version differs from the loaded one. */
  save(event: BusinessEvent): Promise<void>;
}

export const EVENT_REPOSITORY = Symbol('EventRepository');
