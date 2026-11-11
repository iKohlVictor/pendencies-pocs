import { defineMachine, hasRole } from 'machine-flow';
import type { Actor, EventsOf, Machine, StatesOf } from 'machine-flow';
import { ROLE, type Role } from '../../shared/domain/roles.js';

/**
 * The pendency workflows. Each pendency type picks one of them (see
 * pendency-type.ts), so the same aggregate can follow different rules.
 *
 * standard:
 *   branch --(attach | resolve)-----------------> documentation review --approve--> completed
 *      |                                               ^        |
 *      +--(request exception)--> payment scheduling ---+        |
 *                                     |                         |
 *      <-------------- reject (with a reason) -------------------+
 *
 * direct: the same without the exception path (payment scheduling never takes part).
 */

/** What the machine can see of the pendency (room for data-based guards later). */
export interface PendencyFacts {
  id: string;
  documents: readonly string[];
}

/** Effects are data. The application layer decides how to deliver them. */
export type PendencyEffect = { type: 'notify'; role: Role };

const notify = (role: Role): PendencyEffect => ({ type: 'notify', role });

const define = defineMachine<PendencyFacts, Actor, PendencyEffect>();

// Pieces shared by both flows.
const toDocumentationReview = {
  to: 'in_documentation_review',
  policies: [hasRole(ROLE.branch)],
  effects: [notify(ROLE.documentationAnalysis)],
} as const;

const documentationReview = {
  on: {
    APPROVE: { to: 'completed', policies: [hasRole(ROLE.documentationAnalysis)] },
    REJECT: {
      to: 'pending_branch',
      policies: [hasRole(ROLE.documentationAnalysis)],
      effects: [notify(ROLE.branch)],
    },
  },
} as const;

export const standardFlow = define({
  id: 'pendency-standard',
  initial: 'pending_branch',
  states: {
    pending_branch: {
      on: {
        ATTACH_DOCUMENT: toDocumentationReview,
        RESOLVE_WITH_COMMENT: toDocumentationReview,
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
    in_documentation_review: documentationReview,
    completed: { final: true },
  },
});

export const directFlow = define({
  id: 'pendency-direct',
  initial: 'pending_branch',
  states: {
    pending_branch: {
      on: {
        ATTACH_DOCUMENT: toDocumentationReview,
        RESOLVE_WITH_COMMENT: toDocumentationReview,
      },
    },
    in_documentation_review: documentationReview,
    completed: { final: true },
  },
});

/** The standard flow is the superset: every status and action of any flow exists in it. */
export type PendencyStatus = StatesOf<typeof standardFlow>;
export type PendencyAction = EventsOf<typeof standardFlow>;

// Compile-time proof of the line above. Adding a state only to directFlow breaks the build here.
type Subset<A extends B, B> = A;
export type DirectFlowFitsStandard = [
  Subset<StatesOf<typeof directFlow>, PendencyStatus>,
  Subset<EventsOf<typeof directFlow>, PendencyAction>,
];

export type PendencyFlowId = 'standard' | 'direct';
export type PendencyFlow = Machine<string, string, PendencyFacts, Actor, PendencyEffect>;

export const PENDENCY_FLOWS: Record<PendencyFlowId, PendencyFlow> = {
  standard: standardFlow,
  direct: directFlow,
};
