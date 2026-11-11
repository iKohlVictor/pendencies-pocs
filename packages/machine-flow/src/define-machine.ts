import { MachineDefinitionError } from './errors';
import type { Actor, Machine, MachineConfig, StateDef, TransitionDef } from './types';

type AnyState = StateDef<string, string, unknown, Actor, unknown>;
type AnyTransition = TransitionDef<string, unknown, Actor, unknown>;

/**
 * Defines a machine. It is curried so you can fix the data/actor/effect types
 * and let TypeScript infer states and events:
 *
 *   const order = defineMachine<Order, User, Effect>()({ ... });
 *
 * Validates the definition eagerly (fails at boot, not in production).
 */
export function defineMachine<TData = unknown, TActor extends Actor = Actor, TEffect = never>() {
  return <S extends string, E extends string>(
    config: MachineConfig<S, E, TData, TActor, TEffect>,
  ): Machine<S, E, TData, TActor, TEffect> => {
    const problems = validate(config as unknown as MachineConfig<string, string, unknown, Actor, unknown>);
    if (problems.length > 0) throw new MachineDefinitionError(config.id, problems);
    return deepFreeze(config);
  };
}

function validate(config: MachineConfig<string, string, unknown, Actor, unknown>): string[] {
  const problems: string[] = [];
  const states = config.states as Record<string, AnyState>;
  const names = Object.keys(states);

  if (names.length === 0) problems.push('no states defined');
  if (!Object.hasOwn(states, config.initial)) {
    problems.push(`initial state "${config.initial}" does not exist`);
  }

  for (const name of names) {
    const state = states[name]!;
    const events = Object.keys(state.on ?? {});

    if (state.final && events.length > 0) {
      problems.push(`final state "${name}" cannot have transitions`);
    }

    for (const event of events) {
      for (const t of toArray((state.on as Record<string, AnyTransition | readonly AnyTransition[]>)[event])) {
        if (!Object.hasOwn(states, t.to)) {
          problems.push(`"${name}" --${event}--> "${t.to}": target state does not exist`);
        }
      }
    }
  }

  return problems;
}

export function toArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
