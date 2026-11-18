import { defineMachine, hasRole, MachineDefinitionError } from 'machine-flow';
import type { Actor } from 'machine-flow';
import type {
  CompiledFlow,
  FactName,
  PendencyAction,
  PendencyEffect,
  PendencyFacts,
  PendencyFlow,
} from '../../pendencies/domain/pendency.machine.js';
import { DomainError } from '../../shared/domain/domain-error.js';
import { GUARDS, isAction, isGuard, isRole } from './flow-catalog.js';
import type { FlowDefinition, TransitionSpec } from './flow-definition.js';

/** One problem found in a definition. `state` points the builder at the node to highlight. */
export interface FlowIssue {
  message: string;
  state?: string;
  action?: string;
}

export class InvalidFlowDefinitionError extends DomainError {
  constructor(public readonly issues: FlowIssue[]) {
    super(`Invalid flow definition: ${issues.map((i) => i.message).join('; ')}`);
  }
}

const define = defineMachine<PendencyFacts, Actor, PendencyEffect>();

/** Every problem in a definition, without throwing. Empty = it compiles. */
export function validateFlow(def: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const states = def && typeof def.states === 'object' && def.states !== null ? def.states : {};
  const names = Object.keys(states);

  if (names.length === 0) issues.push({ message: 'O fluxo precisa de ao menos um estado' });
  if (!def?.initial || !Object.hasOwn(states, def.initial)) {
    issues.push({ message: `Estado inicial "${def?.initial ?? ''}" não existe` });
  }
  if (!names.some((name) => states[name]?.final)) issues.push({ message: 'O fluxo precisa de ao menos um estado final' });

  for (const [name, state] of Object.entries(states)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      issues.push({ state: name, message: `Id de estado "${name}" inválido (use snake_case)` });
    }
    if (Object.hasOwn(state ?? {}, 'on')) {
      issues.push({ state: name, message: `Estado "${name}" usa o formato antigo "on"; use "transitions"` });
    }
    const transitions = state.transitions ?? [];
    if (!Array.isArray(transitions)) {
      issues.push({ state: name, message: `Transições de "${name}" precisam ser uma lista` });
      continue;
    }
    if (state.final && transitions.length > 0) {
      issues.push({ state: name, message: `Estado final "${name}" não pode ter transições` });
    }
    for (const transition of transitions) issues.push(...validateTransition(name, transition, states));
  }

  if (def?.initial && Object.hasOwn(states, def.initial)) {
    for (const name of names) {
      if (!reachable(def).has(name)) {
        issues.push({ state: name, message: `Estado "${name}" não é alcançável a partir do inicial` });
      }
    }
  }
  return issues;
}

function validateTransition(state: string, transition: TransitionSpec, states: FlowDefinition['states']): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const actions: string[] = Array.isArray(transition?.actions) ? transition.actions : [];
  const arrow = `"${state}" --${actions.join(' | ') || '?'}-->`;
  const at = { state, ...(actions[0] ? { action: actions[0] } : {}) };

  if (actions.length === 0) issues.push({ ...at, message: `${arrow} precisa de ao menos uma ação` });
  for (const action of actions) {
    if (!isAction(action)) issues.push({ ...at, action, message: `Ação desconhecida "${action}"` });
  }
  for (const action of new Set(actions.filter((a, i) => actions.indexOf(a) !== i))) {
    issues.push({ ...at, action, message: `${arrow} repete a ação "${action}"` });
  }
  if (!transition?.to || !Object.hasOwn(states, transition.to)) {
    issues.push({ ...at, message: `${arrow} destino "${transition?.to ?? ''}" não existe` });
  }
  if (!Array.isArray(transition?.roles) || transition.roles.length === 0) {
    issues.push({ ...at, message: `${arrow} precisa de ao menos uma role` });
  }
  for (const role of transition?.roles ?? []) {
    if (!isRole(role)) issues.push({ ...at, message: `Role desconhecida "${role}"` });
  }
  for (const role of transition?.notify ?? []) {
    if (!isRole(role)) issues.push({ ...at, message: `Role de notificação desconhecida "${role}"` });
  }
  for (const id of transition?.guards ?? []) {
    if (!isGuard(id)) issues.push({ ...at, message: `Guard desconhecido "${id}"` });
  }
  return issues;
}

function reachable(def: FlowDefinition): Set<string> {
  const seen = new Set<string>([def.initial]);
  const queue = [def.initial];
  while (queue.length > 0) {
    const state = def.states[queue.shift()!];
    for (const transition of state?.transitions ?? []) {
      if (transition?.to && !seen.has(transition.to)) {
        seen.add(transition.to);
        queue.push(transition.to);
      }
    }
  }
  return seen;
}

/** Turns a JSON definition into a runnable machine. Throws InvalidFlowDefinitionError. */
export function compileFlow(flowId: string, version: number, def: FlowDefinition): CompiledFlow {
  const issues = validateFlow(def);
  if (issues.length > 0) throw new InvalidFlowDefinitionError(issues);

  const requiredFacts = new Set<FactName>();
  const states = Object.fromEntries(
    Object.entries(def.states).map(([name, state]) => {
      // The engine keys branches by action: each action gets, in priority
      // order, every transition that lists it.
      const on: Partial<Record<PendencyAction, unknown[]>> = {};
      for (const transition of state.transitions ?? []) {
        const branch = compileTransition(transition, requiredFacts);
        for (const action of transition.actions) (on[action] ??= []).push(branch);
      }
      return [name, { ...(state.final ? { final: true } : {}), on }];
    }),
  );

  try {
    const machine = define({ id: `pendency-${flowId}@v${version}`, initial: def.initial, states } as never);
    const labels = Object.fromEntries(Object.entries(def.states).map(([name, state]) => [name, state.label || name]));
    return {
      flowId,
      version,
      machine: machine as unknown as PendencyFlow,
      requiredFacts: [...requiredFacts],
      labels,
    };
  } catch (error) {
    if (error instanceof MachineDefinitionError) throw new InvalidFlowDefinitionError([{ message: error.message }]);
    throw error;
  }
}


function compileTransition(transition: TransitionSpec, requiredFacts: Set<FactName>) {
  const guards = (transition.guards ?? []).map((id) => {
    GUARDS[id].requiresFacts.forEach((fact) => requiredFacts.add(fact));
    return GUARDS[id].guard;
  });
  return {
    to: transition.to,
    policies: [hasRole(...transition.roles)],
    ...(guards.length > 0 ? { guards } : {}),
    effects: (transition.notify ?? []).map((role): PendencyEffect => ({ type: 'notify', role })),
  };
}
