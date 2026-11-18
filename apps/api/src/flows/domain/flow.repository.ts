import type { Flow } from './flow.js';

export interface FlowRepository {
  findById(id: string): Promise<Flow | null>;
  findAll(): Promise<Flow[]>;
  /** Must throw ConcurrencyError if the stored revision differs from the loaded one. */
  save(flow: Flow): Promise<void>;
}

export const FLOW_REPOSITORY = Symbol('FlowRepository');
