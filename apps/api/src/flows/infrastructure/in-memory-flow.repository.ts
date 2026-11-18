import { Injectable } from '@nestjs/common';
import { ConcurrencyError } from '../../shared/domain/domain-error.js';
import { Flow, type FlowSnapshot } from '../domain/flow.js';
import type { FlowRepository } from '../domain/flow.repository.js';
import { SEED_FLOWS } from '../domain/seeds.js';

/** Snapshots in a Map, seeded with the original workflows published as v1. */
@Injectable()
export class InMemoryFlowRepository implements FlowRepository {
  private readonly rows = new Map<string, FlowSnapshot>();

  constructor() {
    for (const seed of SEED_FLOWS) {
      const flow = Flow.create(seed.id, seed.name, seed.definition);
      flow.publish({ id: 'system', roles: [] });
      this.rows.set(seed.id, flow.toSnapshot());
    }
  }

  async findById(id: string): Promise<Flow | null> {
    const row = this.rows.get(id);
    return row ? Flow.restore(row) : null;
  }

  async findAll(): Promise<Flow[]> {
    return [...this.rows.values()].map((row) => Flow.restore(row));
  }

  async save(flow: Flow): Promise<void> {
    const snapshot = flow.toSnapshot();
    const stored = this.rows.get(snapshot.id);
    if (stored && stored.revision !== snapshot.revision) throw new ConcurrencyError('Flow', snapshot.id);
    this.rows.set(snapshot.id, { ...snapshot, revision: snapshot.revision + 1 });
  }
}
