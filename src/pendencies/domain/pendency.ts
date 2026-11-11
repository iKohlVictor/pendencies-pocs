import { availableEvents, transition } from 'machine-flow';
import type { Actor } from 'machine-flow';
import { ActionDeniedError, required } from '../../shared/domain/domain-error.js';
import {
  pendencyMachine,
  type PendencyAction,
  type PendencyEffect,
  type PendencyStatus,
} from './pendency.machine.js';

export interface HistoryEntry {
  at: string;
  actorId: string;
  action: PendencyAction | 'OPEN';
  from: PendencyStatus | null;
  to: PendencyStatus;
  detail?: string;
}

/** Plain-data shape of the aggregate: what is stored and what the API returns. */
export interface PendencySnapshot {
  id: string;
  /** The event this pendency belongs to. */
  eventId: string;
  title: string;
  status: PendencyStatus;
  documents: string[];
  resolutionComment?: string;
  exceptionJustification?: string;
  /** Why it came back to the branch. Cleared when the branch acts again. */
  rejectionReason?: string;
  history: HistoryEntry[];
  /** Optimistic-locking counter, bumped by the repository on every save. */
  version: number;
}

/**
 * Aggregate root. It owns its state and invariants, and asks the state machine
 * whether an action is allowed. It stores nothing itself: the application
 * layer loads it, calls one method and saves it.
 */
export class Pendency {
  private constructor(private state: PendencySnapshot) {}

  static open(id: string, eventId: string, title: string, openedBy: Actor): Pendency {
    const trimmed = required('title', title);
    const status = pendencyMachine.initial;
    return new Pendency({
      id,
      eventId,
      title: trimmed,
      status,
      documents: [],
      history: [{ at: now(), actorId: openedBy.id, action: 'OPEN', from: null, to: status }],
      version: 0,
    });
  }

  static restore(snapshot: PendencySnapshot): Pendency {
    return new Pendency(structuredClone(snapshot));
  }

  get id(): string {
    return this.state.id;
  }

  get status(): PendencyStatus {
    return this.state.status;
  }

  get eventId(): string {
    return this.state.eventId;
  }

  // --- branch actions ---

  attachDocument(actor: Actor, documentId: string | undefined): PendencyEffect[] {
    const next = this.authorize('ATTACH_DOCUMENT', actor);
    const id = required('documentId', documentId);
    this.state.documents.push(id);
    return this.commit(next, actor, id);
  }

  resolveWithComment(actor: Actor, comment: string | undefined): PendencyEffect[] {
    const next = this.authorize('RESOLVE_WITH_COMMENT', actor);
    this.state.resolutionComment = required('comment', comment);
    return this.commit(next, actor, this.state.resolutionComment);
  }

  requestException(actor: Actor, justification: string | undefined): PendencyEffect[] {
    const next = this.authorize('REQUEST_EXCEPTION', actor);
    this.state.exceptionJustification = required('justification', justification);
    return this.commit(next, actor, this.state.exceptionJustification);
  }

  // --- reviewer actions (who the reviewer is depends on the current state) ---

  approve(actor: Actor): PendencyEffect[] {
    return this.commit(this.authorize('APPROVE', actor), actor);
  }

  reject(actor: Actor, reason: string | undefined): PendencyEffect[] {
    const next = this.authorize('REJECT', actor);
    const text = required('reason', reason);
    const effects = this.commit(next, actor, text);
    this.state.rejectionReason = text;
    return effects;
  }

  /** Actions this actor may take right now. Drives which buttons a UI shows. */
  availableActions(actor: Actor): PendencyAction[] {
    return availableEvents(pendencyMachine, this.state.status, { actor, data: this.facts() });
  }

  toSnapshot(): PendencySnapshot {
    return structuredClone(this.state);
  }

  /** Asks the machine. Throws before anything is mutated. */
  private authorize(action: PendencyAction, actor: Actor) {
    const result = transition(pendencyMachine, this.state.status, action, { actor, data: this.facts() });
    if (!result.ok) throw new ActionDeniedError('Pendency', this.state.id, result.error);
    return result;
  }

  private commit(
    next: { from: PendencyStatus; to: PendencyStatus; event: PendencyAction; effects: PendencyEffect[] },
    actor: Actor,
    detail?: string,
  ): PendencyEffect[] {
    this.state.status = next.to;
    this.state.rejectionReason = undefined;
    this.state.history.push({
      at: now(),
      actorId: actor.id,
      action: next.event,
      from: next.from,
      to: next.to,
      ...(detail ? { detail } : {}),
    });
    return next.effects;
  }

  private facts() {
    return { id: this.state.id, documents: this.state.documents };
  }
}

/** A pendency counts as resolved once its workflow reached the final state. */
export const isPendencyResolved = (pendency: Pick<PendencySnapshot, 'status'>): boolean =>
  pendency.status === 'completed';

const now = () => new Date().toISOString();
