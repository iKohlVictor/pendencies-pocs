import type { PendencyAction } from '../../pendencies/domain/pendency.machine.js';
import type { Role } from '../../shared/domain/roles.js';
import type { GuardId } from './flow-catalog.js';

/**
 * A pendency workflow as plain JSON: what the builder edits and what gets
 * versioned. States are free; actions, guards and roles come from the catalog.
 */
export interface FlowDefinition {
  initial: string;
  states: Record<string, FlowStateSpec>;
}

export interface FlowStateSpec {
  label: string;
  final?: boolean;
  /** Canvas layout. Ignored by the engine. */
  position?: { x: number; y: number };
  /**
   * Ways out of this state, in priority order. When an action happens, the
   * first transition that lists it and whose roles and guards pass wins.
   */
  transitions?: TransitionSpec[];
}

export interface TransitionSpec {
  /** Any of these actions takes it. */
  actions: PendencyAction[];
  to: string;
  /** Who may take it (any of). Empty = nobody. */
  roles: Role[];
  /** All must pass. */
  guards?: GuardId[];
  /** Roles notified when it happens. */
  notify?: Role[];
}
