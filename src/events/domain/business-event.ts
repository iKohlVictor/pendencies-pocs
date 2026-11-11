import { availableEvents, transition } from 'machine-flow';
import type { Actor } from 'machine-flow';
import { ActionDeniedError, required } from '../../shared/domain/domain-error.js';
import type { PendenciesStatus } from './event-completion.js';
import { eventReleaseMachine, type ReleaseAction, type ReleaseStatus } from './event-release.machine.js';

export interface ReleaseHistoryEntry {
  at: string;
  actorId: string;
  action: ReleaseAction | 'OPEN';
  from: ReleaseStatus | null;
  to: ReleaseStatus;
  detail?: string;
}

export interface BusinessEventSnapshot {
  id: string;
  name: string;
  releaseStatus: ReleaseStatus;
  history: ReleaseHistoryEntry[];
  /** Optimistic-locking counter, bumped by the repository on every save. */
  version: number;
}

/**
 * Aggregate root for an "event": a named group of pendencies with its own
 * release workflow. Named BusinessEvent so it is not confused with the state
 * machine's events (called "actions" in this codebase) or the DOM Event.
 *
 * It owns only the release status. Pendencies are separate aggregates that
 * point to it through `eventId`, so their current status is handed in by the
 * application layer on every call (the machine's guard needs it).
 */
export class BusinessEvent {
  private constructor(private state: BusinessEventSnapshot) {}

  static open(id: string, name: string, openedBy: Actor): BusinessEvent {
    const status = eventReleaseMachine.initial;
    return new BusinessEvent({
      id,
      name: required('name', name),
      releaseStatus: status,
      history: [{ at: now(), actorId: openedBy.id, action: 'OPEN', from: null, to: status }],
      version: 0,
    });
  }

  static restore(snapshot: BusinessEventSnapshot): BusinessEvent {
    return new BusinessEvent(structuredClone(snapshot));
  }

  get id(): string {
    return this.state.id;
  }

  get releaseStatus(): ReleaseStatus {
    return this.state.releaseStatus;
  }

  startAnalysis(actor: Actor, pendencies: PendenciesStatus): void {
    this.apply('START_ANALYSIS', actor, pendencies);
  }

  /** Sends it back to not_scheduled. The reason is optional. */
  returnToNotScheduled(actor: Actor, pendencies: PendenciesStatus, reason?: string): void {
    this.apply('RETURN', actor, pendencies, reason?.trim() || undefined);
  }

  /** Refused with GUARD_FAILED while any pendency of the event is still open. */
  schedule(actor: Actor, pendencies: PendenciesStatus): void {
    this.apply('SCHEDULE', actor, pendencies);
  }

  availableActions(actor: Actor, pendencies: PendenciesStatus): ReleaseAction[] {
    return availableEvents(eventReleaseMachine, this.state.releaseStatus, {
      actor,
      data: { id: this.state.id, pendencies },
    });
  }

  toSnapshot(): BusinessEventSnapshot {
    return structuredClone(this.state);
  }

  private apply(action: ReleaseAction, actor: Actor, pendencies: PendenciesStatus, detail?: string): void {
    const result = transition(eventReleaseMachine, this.state.releaseStatus, action, {
      actor,
      data: { id: this.state.id, pendencies },
    });
    if (!result.ok) throw new ActionDeniedError('Event', this.state.id, result.error);

    this.state.releaseStatus = result.to;
    this.state.history.push({
      at: now(),
      actorId: actor.id,
      action: result.event,
      from: result.from,
      to: result.to,
      ...(detail ? { detail } : {}),
    });
  }
}

const now = () => new Date().toISOString();
