import { availableEvents, transition } from 'machine-flow';
import type { Actor } from 'machine-flow';
import { ActionDeniedError, required } from '../../shared/domain/domain-error.js';
import { PENDENCY_TYPES, type PendencyTypeId } from './pendency-type.js';
import {
  PENDENCY_FLOWS,
  type PendencyAction,
  type PendencyEffect,
  type PendencyFlowId,
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
  /** Decides the default title and the workflow. */
  type: PendencyTypeId;
  /** Workflow it follows, fixed at creation from its type. */
  flow: PendencyFlowId;
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

interface Transitioned {
  from: PendencyStatus;
  to: PendencyStatus;
  action: PendencyAction;
  effects: PendencyEffect[];
}

/**
 * Aggregate root. It owns its state and invariants, and asks the state machine
 * of its flow whether an action is allowed. It stores nothing itself: the
 * application layer loads it, calls one method and saves it.
 */
export class Pendency {
  private constructor(private state: PendencySnapshot) {}

  /** The title defaults to the type's name; pass one to override it. */
  static open(id: string, eventId: string, type: PendencyTypeId, openedBy: Actor, title?: string): Pendency {
    const definition = PENDENCY_TYPES[type];
    const status = PENDENCY_FLOWS[definition.flow].initial as PendencyStatus;
    return new Pendency({
      id,
      eventId,
      type,
      flow: definition.flow,
      title: title?.trim() || definition.name,
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

  /** Only exists in flows with an exception path; otherwise the machine answers INVALID_EVENT. */
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
    return availableEvents(this.machine(), this.state.status, { actor, data: this.facts() }) as PendencyAction[];
  }

  toSnapshot(): PendencySnapshot {
    return structuredClone(this.state);
  }

  /** Asks the machine of this pendency's flow. Throws before anything is mutated. */
  private authorize(action: PendencyAction, actor: Actor): Transitioned {
    const result = transition(this.machine(), this.state.status, action, { actor, data: this.facts() });
    if (!result.ok) throw new ActionDeniedError('Pendency', this.state.id, result.error);
    // Every flow is a subset of the standard one (checked at compile time in pendency.machine.ts).
    return { from: this.state.status, to: result.to as PendencyStatus, action, effects: result.effects };
  }

  private commit(next: Transitioned, actor: Actor, detail?: string): PendencyEffect[] {
    this.state.status = next.to;
    this.state.rejectionReason = undefined;
    this.state.history.push({
      at: now(),
      actorId: actor.id,
      action: next.action,
      from: next.from,
      to: next.to,
      ...(detail ? { detail } : {}),
    });
    return next.effects;
  }

  private machine() {
    return PENDENCY_FLOWS[this.state.flow];
  }

  private facts() {
    return { id: this.state.id, documents: this.state.documents };
  }
}

/** A pendency counts as resolved once its workflow reached the final state. */
export const isPendencyResolved = (pendency: Pick<PendencySnapshot, 'status'>): boolean =>
  pendency.status === 'completed';

const now = () => new Date().toISOString();
