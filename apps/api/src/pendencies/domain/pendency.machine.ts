import type { Actor, Machine } from 'machine-flow';
import type { Role } from '../../shared/domain/roles.js';

/**
 * Pendency workflows are data now: each one is a versioned JSON definition
 * (see src/flows) compiled into a machine-flow Machine. This file keeps only
 * what every workflow shares: what the machine sees and what it returns.
 */

/** What the machine can see of the pendency. Guards in the catalog read these facts. */
export interface PendencyFacts {
  id: string;
  documents: readonly string[];
  /** ISO date-time. Only pendencies whose flow needs it have one. */
  paymentDueAt?: string;
  /** Evaluation time, passed in so the machine stays pure. */
  now: Date;
}

/** Effects are data. The application layer decides how to deliver them. */
export type PendencyEffect = { type: 'notify'; role: Role };

/** The fixed set of actions a pendency supports. Each one has code (and a payload) behind it. */
export const PENDENCY_ACTIONS = [
  'ATTACH_DOCUMENT',
  'RESOLVE_WITH_COMMENT',
  'REQUEST_EXCEPTION',
  'APPROVE',
  'REJECT',
] as const;

export type PendencyAction = (typeof PENDENCY_ACTIONS)[number];

/** States are free: each flow version names its own. */
export type PendencyStatus = string;

export type PendencyFlow = Machine<string, PendencyAction, PendencyFacts, Actor, PendencyEffect>;

/** A flow version ready to run. */
export interface CompiledFlow {
  flowId: string;
  version: number;
  machine: PendencyFlow;
  /** Facts some guard of this version needs, so the pendency must carry them (e.g. paymentDueAt). */
  requiredFacts: readonly FactName[];
  /** State id -> human label, from the definition. */
  labels: Readonly<Record<string, string>>;
}

export type FactName = 'paymentDueAt';
