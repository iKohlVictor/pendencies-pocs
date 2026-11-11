import type { Actor, Guard, Policy, TransitionContext } from './types';

/** Creates a named policy. The name shows up in the FORBIDDEN error. */
export function policy<TData = unknown, TActor extends Actor = Actor>(
  name: string,
  check: (ctx: TransitionContext<TData, TActor>) => boolean,
): Policy<TData, TActor> {
  return { kind: 'policy', name, check };
}

/** Creates a named guard. The name shows up in the GUARD_FAILED error. */
export function guard<TData = unknown, TActor extends Actor = Actor>(
  name: string,
  check: (ctx: TransitionContext<TData, TActor>) => boolean,
): Guard<TData, TActor> {
  return { kind: 'guard', name, check };
}

/** Passes if the actor has at least one of the roles. */
export function hasRole(...roles: string[]): Policy {
  return policy(`role:${roles.join('|')}`, ({ actor }) =>
    roles.some((role) => actor.roles.includes(role)),
  );
}

/** Passes if at least one of the policies passes (OR). */
export function anyOf<TData = unknown, TActor extends Actor = Actor>(
  ...policies: Policy<TData, TActor>[]
): Policy<TData, TActor> {
  return policy(`anyOf(${policies.map((p) => p.name).join(', ')})`, (ctx) =>
    policies.some((p) => p.check(ctx)),
  );
}
