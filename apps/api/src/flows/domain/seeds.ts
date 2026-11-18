import type { PendencyAction } from '../../pendencies/domain/pendency.machine.js';
import { ROLE, type Role } from '../../shared/domain/roles.js';
import type { FlowDefinition, TransitionSpec } from './flow-definition.js';

/**
 * The three original workflows, written as data. They are published as v1 when
 * the app starts.
 *
 * standard:
 *   branch --(attach | resolve)-----------------> documentation review --approve--> completed
 *      |                                               ^        |
 *      +--(request exception)--> payment scheduling ---+        |
 *      <-------------- reject (with a reason) -------------------+
 *
 * direct: the same without the exception path.
 *
 * payment: documentation analysis always reviews; due within 48h, payment scheduling approves too.
 */

const RESOLVE_ACTIONS = ['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT'] as const satisfies PendencyAction[];

/** The branch resolves with a document or a comment: either sends it to review. */
const resolveToDocumentationReview: TransitionSpec = {
  actions: [...RESOLVE_ACTIONS],
  to: 'in_documentation_review',
  roles: [ROLE.branch],
  notify: [ROLE.documentationAnalysis],
};
const rejectBy = (role: Role): TransitionSpec => ({
  actions: ['REJECT'],
  to: 'pending_branch',
  roles: [role],
  notify: [ROLE.branch],
});

const LABELS = {
  pending_branch: 'Pendente com a filial',
  in_documentation_review: 'Em análise de documentação',
  in_payment_scheduling_review: 'Em programação de pagamento',
  completed: 'Concluída',
};

export const STANDARD_FLOW: FlowDefinition = {
  initial: 'pending_branch',
  states: {
    pending_branch: {
      label: LABELS.pending_branch,
      position: { x: 0, y: 220 },
      transitions: [
        resolveToDocumentationReview,
        {
          actions: ['REQUEST_EXCEPTION'],
          to: 'in_payment_scheduling_review',
          roles: [ROLE.branch],
          notify: [ROLE.paymentScheduling],
        },
      ],
    },
    in_payment_scheduling_review: {
      label: LABELS.in_payment_scheduling_review,
      position: { x: 480, y: 0 },
      transitions: [
        {
          actions: ['APPROVE'],
          to: 'in_documentation_review',
          roles: [ROLE.paymentScheduling],
          notify: [ROLE.documentationAnalysis],
        },
        rejectBy(ROLE.paymentScheduling),
      ],
    },
    in_documentation_review: {
      label: LABELS.in_documentation_review,
      position: { x: 480, y: 440 },
      transitions: [
        { actions: ['APPROVE'], to: 'completed', roles: [ROLE.documentationAnalysis] },
        rejectBy(ROLE.documentationAnalysis),
      ],
    },
    completed: { label: LABELS.completed, final: true, position: { x: 900, y: 440 } },
  },
};

export const DIRECT_FLOW: FlowDefinition = {
  initial: 'pending_branch',
  states: {
    pending_branch: {
      label: LABELS.pending_branch,
      position: { x: 0, y: 0 },
      transitions: [resolveToDocumentationReview],
    },
    in_documentation_review: {
      label: LABELS.in_documentation_review,
      position: { x: 460, y: 260 },
      transitions: [
        { actions: ['APPROVE'], to: 'completed', roles: [ROLE.documentationAnalysis] },
        rejectBy(ROLE.documentationAnalysis),
      ],
    },
    completed: { label: LABELS.completed, final: true, position: { x: 880, y: 260 } },
  },
};

export const PAYMENT_FLOW: FlowDefinition = {
  initial: 'pending_branch',
  states: {
    pending_branch: {
      label: LABELS.pending_branch,
      position: { x: 0, y: 0 },
      transitions: [resolveToDocumentationReview],
    },
    in_documentation_review: {
      label: LABELS.in_documentation_review,
      position: { x: 440, y: 260 },
      transitions: [
        // Order matters: due within 48h goes to payment scheduling first.
        {
          actions: ['APPROVE'],
          to: 'in_payment_scheduling_review',
          roles: [ROLE.documentationAnalysis],
          guards: ['payment-due-within-48h'],
          notify: [ROLE.paymentScheduling],
        },
        { actions: ['APPROVE'], to: 'completed', roles: [ROLE.documentationAnalysis] },
        rejectBy(ROLE.documentationAnalysis),
      ],
    },
    in_payment_scheduling_review: {
      label: LABELS.in_payment_scheduling_review,
      position: { x: 880, y: 0 },
      transitions: [
        { actions: ['APPROVE'], to: 'completed', roles: [ROLE.paymentScheduling] },
        rejectBy(ROLE.paymentScheduling),
      ],
    },
    completed: { label: LABELS.completed, final: true, position: { x: 1280, y: 260 } },
  },
};

export const SEED_FLOWS = [
  { id: 'standard', name: 'Padrão', definition: STANDARD_FLOW },
  { id: 'direct', name: 'Direto', definition: DIRECT_FLOW },
  { id: 'payment', name: 'Pagamento', definition: PAYMENT_FLOW },
] as const;
