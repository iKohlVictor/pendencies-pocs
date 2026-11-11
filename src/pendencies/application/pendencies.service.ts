import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import { Pendency, type PendencySnapshot } from '../domain/pendency.js';
import { NotFoundError } from '../../shared/domain/domain-error.js';
import type { PendencyAction, PendencyEffect } from '../domain/pendency.machine.js';
import { PENDENCY_REPOSITORY, type PendencyRepository } from '../domain/pendency.repository.js';
import { NOTIFICATION_OUTBOX, type NotificationOutbox } from './notification-outbox.js';

/**
 * Use cases. Every command has the same shape: load the aggregate, call one
 * domain method, save (optimistic lock), then deliver the returned effects.
 */
@Injectable()
export class PendenciesService {
  constructor(
    @Inject(PENDENCY_REPOSITORY) private readonly pendencies: PendencyRepository,
    @Inject(NOTIFICATION_OUTBOX) private readonly outbox: NotificationOutbox,
  ) {}

  /** Called by the events module, which has already checked that the event exists. */
  async open(actor: Actor, eventId: string, title: string | undefined): Promise<PendencySnapshot> {
    const pendency = Pendency.open(await this.pendencies.nextId(), eventId, title ?? '', actor);
    await this.pendencies.save(pendency);
    return (await this.load(pendency.id)).toSnapshot();
  }

  async list(): Promise<PendencySnapshot[]> {
    return (await this.pendencies.findAll()).map((p) => p.toSnapshot());
  }

  async listByEvent(eventId: string): Promise<PendencySnapshot[]> {
    return (await this.pendencies.findByEventId(eventId)).map((p) => p.toSnapshot());
  }

  async get(id: string): Promise<PendencySnapshot> {
    return (await this.load(id)).toSnapshot();
  }

  async availableActions(id: string, actor: Actor): Promise<PendencyAction[]> {
    return (await this.load(id)).availableActions(actor);
  }

  attachDocument(id: string, actor: Actor, documentId?: string) {
    return this.execute(id, (p) => p.attachDocument(actor, documentId));
  }

  resolveWithComment(id: string, actor: Actor, comment?: string) {
    return this.execute(id, (p) => p.resolveWithComment(actor, comment));
  }

  requestException(id: string, actor: Actor, justification?: string) {
    return this.execute(id, (p) => p.requestException(actor, justification));
  }

  approve(id: string, actor: Actor) {
    return this.execute(id, (p) => p.approve(actor));
  }

  reject(id: string, actor: Actor, reason?: string) {
    return this.execute(id, (p) => p.reject(actor, reason));
  }

  private async execute(id: string, command: (pendency: Pendency) => PendencyEffect[]): Promise<PendencySnapshot> {
    const pendency = await this.load(id);
    const effects = command(pendency);
    await this.pendencies.save(pendency);

    const saved = (await this.load(id)).toSnapshot();
    for (const effect of effects) await this.deliver(effect, saved);
    return saved;
  }

  private async deliver(effect: PendencyEffect, pendency: PendencySnapshot): Promise<void> {
    const reason = pendency.rejectionReason ? ` Reason: ${pendency.rejectionReason}` : '';
    await this.outbox.publish({
      at: new Date().toISOString(),
      pendencyId: pendency.id,
      role: effect.role,
      message: `Pendency ${pendency.id} ("${pendency.title}") is waiting for you (${pendency.status}).${reason}`,
    });
  }

  private async load(id: string): Promise<Pendency> {
    const pendency = await this.pendencies.findById(id);
    if (!pendency) throw new NotFoundError('Pendency', id);
    return pendency;
  }
}
