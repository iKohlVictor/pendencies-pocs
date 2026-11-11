/** Who triggers an event. The application can extend it with its own fields. */
export interface Actor {
  id: string;
  roles: readonly string[];
}

/** Everything policies, guards and effects can see. The lib never fetches data on its own. */
export interface TransitionContext<TData = unknown, TActor extends Actor = Actor> {
  actor: TActor;
  data: TData;
}

type Check<TData, TActor extends Actor> = (ctx: TransitionContext<TData, TActor>) => boolean;

/** WHO may trigger the transition (role, approval limit). Failure => FORBIDDEN. */
export interface Policy<TData = unknown, TActor extends Actor = Actor> {
  readonly kind: 'policy';
  readonly name: string;
  readonly check: Check<TData, TActor>;
}

/** WHETHER the transition may happen, based on the data. Failure => GUARD_FAILED. */
export interface Guard<TData = unknown, TActor extends Actor = Actor> {
  readonly kind: 'guard';
  readonly name: string;
  readonly check: Check<TData, TActor>;
}

export interface TransitionDef<S extends string, TData, TActor extends Actor, TEffect> {
  /** Target state. */
  to: NoInfer<S>;
  /** All must pass (AND). */
  policies?: readonly Policy<TData, TActor>[];
  /** All must pass (AND). */
  guards?: readonly Guard<TData, TActor>[];
  /** Effects as data: the lib only returns them, the application runs them. */
  effects?: readonly TEffect[] | ((ctx: TransitionContext<TData, TActor>) => readonly TEffect[]);
}

export interface StateDef<S extends string, E extends string, TData, TActor extends Actor, TEffect> {
  /** Final state: accepts no further events. */
  final?: boolean;
  /**
   * Event -> transition. An array defines branches: the first one whose
   * policies and guards pass wins.
   */
  on?: {
    [K in E]?:
      | TransitionDef<S, TData, TActor, TEffect>
      | readonly TransitionDef<S, TData, TActor, TEffect>[];
  };
}

export interface MachineConfig<S extends string, E extends string, TData, TActor extends Actor, TEffect> {
  id: string;
  initial: NoInfer<S>;
  states: Record<S, StateDef<S, E, TData, TActor, TEffect>>;
}

/** Validated, immutable definition. It is plain data: safe to share across requests. */
export type Machine<
  S extends string = string,
  E extends string = string,
  TData = unknown,
  TActor extends Actor = Actor,
  TEffect = never,
> = Readonly<MachineConfig<S, E, TData, TActor, TEffect>>;

export type TransitionError =
  | { code: 'UNKNOWN_STATE'; state: string }
  | { code: 'FINAL_STATE'; state: string; event: string }
  | { code: 'INVALID_EVENT'; state: string; event: string }
  | { code: 'FORBIDDEN'; state: string; event: string; failed: string[] }
  | { code: 'GUARD_FAILED'; state: string; event: string; failed: string[] };

export type TransitionResult<S extends string, E extends string, TEffect> =
  | { ok: true; from: S; to: S; event: E; effects: TEffect[] }
  | { ok: false; error: TransitionError };

/** Extracts the types of a machine: StatesOf<typeof order>. */
export type StatesOf<M> = M extends Machine<infer S, any, any, any, any> ? S : never;
export type EventsOf<M> = M extends Machine<any, infer E, any, any, any> ? E : never;
