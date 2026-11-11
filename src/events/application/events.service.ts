import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import { PendenciesService } from '../../pendencies/application/pendencies.service.js';
import { isPendencyResolved, type PendencySnapshot } from '../../pendencies/domain/pendency.js';
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

  async open(actor: Actor, name: string | undefined): Promise<EventView> {
    const event = BusinessEvent.open(await this.events.nextId(), name ?? '', actor);
    await this.events.save(event);
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

  async openPendency(id: string, actor: Actor, title: string | undefined): Promise<PendencySnapshot> {
    await this.load(id); // 404 if the event does not exist
    return this.pendencies.open(actor, id, title);
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
