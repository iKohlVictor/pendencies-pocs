import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import { PendenciesService } from '../../pendencies/application/pendencies.service.js';
import { isPendencyResolved, type PendencySnapshot } from '../../pendencies/domain/pendency.js';
import { parsePendencyType } from '../../pendencies/domain/pendency-type.js';
import { NotFoundError } from '../../shared/domain/domain-error.js';
import { BusinessEvent, type BusinessEventSnapshot } from '../domain/business-event.js';
import {
  isEventCompleted,
  summarizePendencies,
  type PendenciesStatus,
  type PendenciesSummary,
} from '../domain/event-completion.js';
import type { ReleaseAction } from '../domain/event-release.machine.js';
import { EVENT_REPOSITORY, type EventRepository } from '../domain/event.repository.js';
import { EVENT_TYPES, parseEventType } from '../domain/event-type.js';

/** What the API returns: the stored event plus everything derived from its pendencies. */
export interface EventView extends BusinessEventSnapshot {
  pendencies: PendenciesSummary;
  /** scheduled AND all pendencies resolved. */
  completed: boolean;
}

@Injectable()
export class EventsService {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    private readonly pendencies: PendenciesService,
  ) {}

  /**
   * Creates the event and, right after, every pendency its type predefines.
   * The payment due date, when given, is the one all its payment pendencies follow.
   */
  async open(actor: Actor, type: string | undefined, name?: string, paymentDueAt?: string): Promise<EventView> {
    const eventType = parseEventType(type);
    const event = BusinessEvent.open(await this.events.nextId(), eventType, actor, name, paymentDueAt);
    await this.events.save(event);

    for (const pendencyType of EVENT_TYPES[eventType].pendencyTypes) {
      await this.pendencies.open(actor, event.id, pendencyType, undefined, event.paymentDueAt);
    }
    return this.get(event.id);
  }

  async list(): Promise<EventView[]> {
    return Promise.all((await this.events.findAll()).map((event) => this.view(event)));
  }

  async get(id: string): Promise<EventView> {
    return this.view(await this.load(id));
  }

  async availableActions(id: string, actor: Actor): Promise<ReleaseAction[]> {
    const pendencies = await this.summarize(id);
    return (await this.load(id)).availableActions(actor, pendencies.status);
  }

  // --- pendencies inside the event ---

  /**
   * Adds one more pendency by hand, of any known type. If the event has a payment
   * due date, it wins over the one sent for the pendency.
   */
  async openPendency(
    id: string,
    actor: Actor,
    type: string | undefined,
    title?: string,
    paymentDueAt?: string,
  ): Promise<PendencySnapshot> {
    const event = await this.load(id); // 404 if the event does not exist
    return this.pendencies.open(actor, id, parsePendencyType(type), title, event.paymentDueAt ?? paymentDueAt);
  }

  async listPendencies(id: string): Promise<PendencySnapshot[]> {
    await this.load(id);
    return this.pendencies.listByEvent(id);
  }

  // --- release workflow ---

  startAnalysis(id: string, actor: Actor) {
    return this.execute(id, (event, pendencies) => event.startAnalysis(actor, pendencies));
  }

  returnToNotScheduled(id: string, actor: Actor, reason?: string) {
    return this.execute(id, (event, pendencies) => event.returnToNotScheduled(actor, pendencies, reason));
  }

  schedule(id: string, actor: Actor) {
    return this.execute(id, (event, pendencies) => event.schedule(actor, pendencies));
  }

  /** Loads the event and the current status of its pendencies, which the release guard depends on. */
  private async execute(
    id: string,
    command: (event: BusinessEvent, pendencies: PendenciesStatus) => void,
  ): Promise<EventView> {
    const event = await this.load(id);
    command(event, (await this.summarize(id)).status);
    await this.events.save(event);
    return this.get(id);
  }

  /** Pendencies status and completion are computed on read, so they can never go stale. */
  private async view(event: BusinessEvent): Promise<EventView> {
    const snapshot = event.toSnapshot();
    const pendencies = await this.summarize(snapshot.id);
    return {
      ...snapshot,
      pendencies,
      completed: isEventCompleted(snapshot.releaseStatus, pendencies.status),
    };
  }

  private async summarize(eventId: string): Promise<PendenciesSummary> {
    return summarizePendencies((await this.pendencies.listByEvent(eventId)).map(isPendencyResolved));
  }

  private async load(id: string): Promise<BusinessEvent> {
    const event = await this.events.findById(id);
    if (!event) throw new NotFoundError('Event', id);
    return event;
  }
}
