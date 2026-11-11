# machine-flow

**Stateless** state machine for approval flows: states, transitions, policies (who may), guards (whether it may) and effects. Zero runtime dependencies.

The lib stores nothing. You pass the current state and the event; it returns the next state and the effects, or a typed error.

```
transition(machine, currentState, event, { actor, data }) → { ok, to, effects } | { ok: false, error }
```

## Usage

```ts
import { defineMachine, transition, availableEvents, guard, hasRole } from 'machine-flow';

const order = defineMachine<Order, User, Effect>()({
  id: 'order',
  initial: 'draft',
  states: {
    draft: {
      on: { SUBMIT: { to: 'awaiting_manager', guards: [hasItems] } },
    },
    awaiting_manager: {
      on: {
        APPROVE: { to: 'approved', policies: [hasRole('manager')] },
        REJECT: { to: 'rejected', policies: [hasRole('manager')] },
      },
    },
    approved: { final: true },
    rejected: { final: true },
  },
});

const r = transition(order, entity.status, 'APPROVE', { actor: user, data: entity });

if (r.ok) {
  // 1. persist r.to (with optimistic locking, see below)
  // 2. run r.effects
} else {
  // r.error.code: UNKNOWN_STATE | FINAL_STATE | INVALID_EVENT | FORBIDDEN | GUARD_FAILED
}
```

Full examples (domain in Portuguese):

- [`examples/venda.ts`](examples/venda.ts): sales approval with escalating approval limits. `npm run example`
- [`examples/pendencia.ts`](examples/pendencia.ts): three-role review flow with an exception path. `npm run example:pendencia`

## Concepts

| Concept | What it is | Error on failure |
| --- | --- | --- |
| **State** | A step in the flow. `final: true` ends it. | `UNKNOWN_STATE`, `FINAL_STATE` |
| **Event** | What triggers a transition (`APPROVE`). | `INVALID_EVENT` |
| **Actor** | Who triggers it: `{ id, roles }`. | |
| **Policy** | *Who* may trigger it (role, approval limit). | `FORBIDDEN` |
| **Guard** | *Whether* it may happen, based on the data. | `GUARD_FAILED` |
| **Effect** | What to do afterwards, as data. The application runs it. | |

An event can have several transitions (an array): the first one whose rules pass wins. That is how approval-limit escalation is modeled.

## API

- `defineMachine<TData, TActor, TEffect>()(config)`: validates and freezes the definition. Throws `MachineDefinitionError` on a missing state or a final state with transitions.
- `transition(machine, state, event, ctx)`: pure function, never throws.
- `can(machine, state, event, ctx)`: `boolean`.
- `availableEvents(machine, state, ctx)`: events the actor can trigger right now (handy for the front end to decide which buttons to show).
- `policy(name, fn)`, `guard(name, fn)`, `hasRole(...roles)`, `anyOf(...policies)`.
- Types: `StatesOf<typeof m>`, `EventsOf<typeof m>`.

## Design decisions

- **Synchronous and pure.** Policies and guards do no I/O. Load what you need beforehand and pass it in `data`.
- **Errors as values**, not exceptions: a denied transition is normal business flow.
- **Effects as data**: easy to test and to run inside a transaction/outbox.

## Concurrency (the application's responsibility)

Since the lib is stateless, protect the update against races:

```sql
UPDATE orders SET status = :next WHERE id = :id AND status = :previous;
-- 0 rows affected => someone transitioned first; reload and retry
```

## Scripts

```bash
npm install
npm test          # vitest
npm run typecheck
npm run build     # ESM + CJS + .d.ts in dist/
npm run example
```

## Out of scope (for now)

Hierarchical/parallel states, timers, transition history, NestJS adapter, serializing the definition (JSON).
