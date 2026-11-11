import { Injectable } from '@nestjs/common';
import { ConcurrencyError } from '../../shared/domain/domain-error.js';
import { BusinessEvent, type BusinessEventSnapshot } from '../domain/business-event.js';
import type { EventRepository } from '../domain/event.repository.js';

@Injectable()
export class InMemoryEventRepository implements EventRepository {
  private readonly rows = new Map<string, BusinessEventSnapshot>();
  private sequence = 0;

  async nextId(): Promise<string> {
    this.sequence += 1;
    return `EVT-${this.sequence}`;
  }

  async findById(id: string): Promise<BusinessEvent | null> {
    const row = this.rows.get(id);
    return row ? BusinessEvent.restore(row) : null;
  }

  async findAll(): Promise<BusinessEvent[]> {
    return [...this.rows.values()].map((row) => BusinessEvent.restore(row));
  }

  async save(event: BusinessEvent): Promise<void> {
    const snapshot = event.toSnapshot();
    const stored = this.rows.get(snapshot.id);
    if (stored && stored.version !== snapshot.version) throw new ConcurrencyError('Event', snapshot.id);
    this.rows.set(snapshot.id, { ...snapshot, version: snapshot.version + 1 });
  }
}
