import { toArray } from './define-machine';
import type {
  Actor,
  Guard,
  Machine,
  Policy,
  StateDef,
  TransitionContext,
  TransitionDef,
  TransitionResult,
} from './types';

/**
 * Accepts a string coming from the database/HTTP without losing literal autocomplete.
 * NoInfer: states and events are inferred from the machine only.
 */
type Loose<T extends string> = NoInfer<T> | (string & {});

/**
 * Pure function: given the current state and an event, returns the next state and
 * the effects, or a typed error. Persists nothing and never throws.
 */
export function transition<S extends string, E extends string, TData, TActor extends Actor, TEffect>(
  machine: Machine<S, E, TData, TActor, TEffect>,
  state: Loose<S>,
  event: Loose<E>,
  ctx: TransitionContext<TData, TActor>,
): TransitionResult<S, E, TEffect> {
  const stateDef = getState(machine, state);
  if (!stateDef) return { ok: false, error: { code: 'UNKNOWN_STATE', state } };
  if (stateDef.final) return { ok: false, error: { code: 'FINAL_STATE', state, event } };

  const candidates = getCandidates(stateDef, event);
  if (candidates.length === 0) return { ok: false, error: { code: 'INVALID_EVENT', state, event } };

  const deniedPolicies = new Set<string>();
  const failedGuards = new Set<string>();
  let anyAuthorized = false;

  for (const candidate of candidates) {
    const denied = failing(candidate.policies, ctx);
    if (denied.length > 0) {
      denied.forEach((name) => deniedPolicies.add(name));
      continue;
    }
    anyAuthorized = true;

    const failed = failing(candidate.guards, ctx);
    if (failed.length > 0) {
      failed.forEach((name) => failedGuards.add(name));
      continue;
    }

    const effects =
      typeof candidate.effects === 'function' ? candidate.effects(ctx) : (candidate.effects ?? []);

    return { ok: true, from: state as S, to: candidate.to as S, event: event as E, effects: [...effects] };
  }

  // Authorized on some branch but blocked by the data => GUARD_FAILED.
  return anyAuthorized
    ? { ok: false, error: { code: 'GUARD_FAILED', state, event, failed: [...failedGuards] } }
    : { ok: false, error: { code: 'FORBIDDEN', state, event, failed: [...deniedPolicies] } };
}

/** Boolean shortcut for transition(...).ok. */
export function can<S extends string, E extends string, TData, TActor extends Actor, TEffect>(
  machine: Machine<S, E, TData, TActor, TEffect>,
  state: Loose<S>,
  event: Loose<E>,
  ctx: TransitionContext<TData, TActor>,
): boolean {
  return transition(machine, state, event, ctx).ok;
}

/** Events this actor can trigger right now. Useful for the front end to decide which actions to show. */
export function availableEvents<S extends string, E extends string, TData, TActor extends Actor, TEffect>(
  machine: Machine<S, E, TData, TActor, TEffect>,
  state: Loose<S>,
  ctx: TransitionContext<TData, TActor>,
): E[] {
  const stateDef = getState(machine, state);
  if (!stateDef || stateDef.final) return [];
  return (Object.keys(stateDef.on ?? {}) as E[]).filter((event) => can(machine, state, event, ctx));
}

function getState<S extends string, E extends string, TData, TActor extends Actor, TEffect>(
  machine: Machine<S, E, TData, TActor, TEffect>,
  state: string,
): StateDef<S, E, TData, TActor, TEffect> | undefined {
  return Object.hasOwn(machine.states, state) ? machine.states[state as S] : undefined;
}

function getCandidates<S extends string, E extends string, TData, TActor extends Actor, TEffect>(
  stateDef: StateDef<S, E, TData, TActor, TEffect>,
  event: string,
): readonly TransitionDef<S, TData, TActor, TEffect>[] {
  const on = stateDef.on;
  if (!on || !Object.hasOwn(on, event)) return [];
  return toArray(on[event as E]);
}

function failing<TData, TActor extends Actor>(
  rules: readonly (Policy<TData, TActor> | Guard<TData, TActor>)[] | undefined,
  ctx: TransitionContext<TData, TActor>,
): string[] {
  return (rules ?? []).filter((rule) => !rule.check(ctx)).map((rule) => rule.name);
}
