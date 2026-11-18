import { Injectable } from '@nestjs/common';
import type { Pendency, PendencySnapshot } from '../domain/pendency.js';
import { ConcurrencyError } from '../../shared/domain/domain-error.js';
import type { PendencyRepository } from '../domain/pendency.repository.js';

/**
 * Keeps snapshots (plain data), never live aggregates, so callers cannot change
 * stored state without going through save(). The version check mirrors
 * `UPDATE ... WHERE id = ? AND version = ?` on a real database.
 */
@Injectable()
export class InMemoryPendencyRepository implements PendencyRepository {
  private readonly rows = new Map<string, PendencySnapshot>();
  private sequence = 0;

  async nextId(): Promise<string> {
    this.sequence += 1;
    return `PEND-${this.sequence}`;
  }

  async findById(id: string): Promise<PendencySnapshot | null> {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }

  async findAll(): Promise<PendencySnapshot[]> {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }

  async findByEventId(eventId: string): Promise<PendencySnapshot[]> {
    return [...this.rows.values()].filter((row) => row.eventId === eventId).map((row) => structuredClone(row));
  }

  async save(pendency: Pendency): Promise<void> {
    const snapshot = pendency.toSnapshot();
    const stored = this.rows.get(snapshot.id);
    if (stored && stored.version !== snapshot.version) throw new ConcurrencyError('Pendency', snapshot.id);
    this.rows.set(snapshot.id, { ...snapshot, version: snapshot.version + 1 });
  }
}
