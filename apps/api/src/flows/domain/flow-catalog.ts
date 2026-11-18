import { guard, type Guard } from 'machine-flow';
import {
  PENDENCY_ACTIONS,
  type FactName,
  type PendencyAction,
  type PendencyFacts,
} from '../../pendencies/domain/pendency.machine.js';
import { ROLE, type Role } from '../../shared/domain/roles.js';

/**
 * The building blocks a flow can use. Everything here has code behind it:
 * the builder only arranges them, it cannot invent new ones.
 */

export interface ActionInfo {
  id: PendencyAction;
  label: string;
  /** Field the action requires in its body, if any. */
  payload?: string;
}

export const ACTIONS: Record<PendencyAction, ActionInfo> = {
  ATTACH_DOCUMENT: { id: 'ATTACH_DOCUMENT', label: 'Anexar documento', payload: 'documentId' },
  RESOLVE_WITH_COMMENT: { id: 'RESOLVE_WITH_COMMENT', label: 'Resolver com comentário', payload: 'comment' },
  REQUEST_EXCEPTION: { id: 'REQUEST_EXCEPTION', label: 'Pedir exceção', payload: 'justification' },
  APPROVE: { id: 'APPROVE', label: 'Aprovar' },
  REJECT: { id: 'REJECT', label: 'Rejeitar', payload: 'reason' },
};

/** Payments due within this window also need payment scheduling's approval. */
export const PAYMENT_SCHEDULING_WINDOW_MS = 48 * 60 * 60 * 1000;

/** True when the payment is due in 48h or less (overdue counts as within). */
export const isWithinPaymentWindow = (paymentDueAt: string, now: Date): boolean =>
  Date.parse(paymentDueAt) - now.getTime() <= PAYMENT_SCHEDULING_WINDOW_MS;

interface GuardEntry {
  label: string;
  description: string;
  /** Facts the pendency must carry for this guard to make sense. */
  requiresFacts: readonly FactName[];
  guard: Guard<PendencyFacts>;
}

export const GUARDS = {
  'payment-due-within-48h': {
    label: 'Pagamento vence em até 48h',
    description: 'Passa quando o vencimento do pagamento é em 48h ou menos (vencido conta).',
    requiresFacts: ['paymentDueAt'],
    guard: guard<PendencyFacts>(
      'payment-due-within-48h',
      ({ data }) => data.paymentDueAt !== undefined && isWithinPaymentWindow(data.paymentDueAt, data.now),
    ),
  },
} as const satisfies Record<string, GuardEntry>;

export type GuardId = keyof typeof GUARDS;

export const ROLE_LABEL: Record<Role, string> = {
  [ROLE.branch]: 'Filial',
  [ROLE.documentationAnalysis]: 'Análise de documentação',
  [ROLE.paymentScheduling]: 'Programação de pagamento',
};

export const isAction = (value: string): value is PendencyAction =>
  (PENDENCY_ACTIONS as readonly string[]).includes(value);
export const isGuard = (value: string): value is GuardId => Object.hasOwn(GUARDS, value);
export const isRole = (value: string): value is Role => Object.hasOwn(ROLE_LABEL, value);

/** What the builder shows in its palette. */
export function flowCatalog() {
  return {
    actions: Object.values(ACTIONS),
    guards: Object.entries(GUARDS).map(([id, g]) => ({
      id,
      label: g.label,
      description: g.description,
      requiresFacts: g.requiresFacts,
    })),
    roles: Object.entries(ROLE_LABEL).map(([id, label]) => ({ id, label })),
    effects: [{ id: 'notify', label: 'Notificar role' }],
  };
}
