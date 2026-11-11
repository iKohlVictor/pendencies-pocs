import { defineMachine, hasRole } from 'machine-flow';
import type { Actor, EventsOf, StatesOf } from 'machine-flow';
import { ROLE, type Role } from '../../shared/domain/roles.js';

/**
 * The workflow rules live here and nowhere else: which states exist, which
 * events move between them, and which role may trigger each one.
 *
 *   branch --(attach | resolve)-----------------> documentation review --approve--> completed
 *      |                                               ^        |
 *      +--(request exception)--> payment scheduling ---+        |
 *                                     |                         |
 *      <-------------- reject (with a reason) -------------------+
 */

/** What the machine can see of the pendency (room for data-based guards later). */
export interface PendencyFacts {
  id: string;
  documents: readonly string[];
}

/** Effects are data. The application layer decides how to deliver them. */
export type PendencyEffect = { type: 'notify'; role: Role };

const notify = (role: Role): PendencyEffect => ({ type: 'notify', role });

export const pendencyMachine = defineMachine<PendencyFacts, Actor, PendencyEffect>()({
  id: 'pendency',
  initial: 'pending_branch',
  states: {
    pending_branch: {
      on: {
        ATTACH_DOCUMENT: {
          to: 'in_documentation_review',
          policies: [hasRole(ROLE.branch)],
          effects: [notify(ROLE.documentationAnalysis)],
        },
        RESOLVE_WITH_COMMENT: {
          to: 'in_documentation_review',
          policies: [hasRole(ROLE.branch)],
          effects: [notify(ROLE.documentationAnalysis)],
        },
        // An exception goes through payment scheduling first.
        REQUEST_EXCEPTION: {
          to: 'in_payment_scheduling_review',
          policies: [hasRole(ROLE.branch)],
          effects: [notify(ROLE.paymentScheduling)],
        },
      },
    },
    in_payment_scheduling_review: {
      on: {
        APPROVE: {
          to: 'in_documentation_review',
          policies: [hasRole(ROLE.paymentScheduling)],
          effects: [notify(ROLE.documentationAnalysis)],
        },
        REJECT: {
          to: 'pending_branch',
          policies: [hasRole(ROLE.paymentScheduling)],
          effects: [notify(ROLE.branch)],
        },
      },
    },
    in_documentation_review: {
      on: {
        APPROVE: { to: 'completed', policies: [hasRole(ROLE.documentationAnalysis)] },
        REJECT: {
          to: 'pending_branch',
          policies: [hasRole(ROLE.documentationAnalysis)],
          effects: [notify(ROLE.branch)],
        },
      },
    },
    completed: { final: true },
  },
});

export type PendencyStatus = StatesOf<typeof pendencyMachine>;
export type PendencyAction = EventsOf<typeof pendencyMachine>;
