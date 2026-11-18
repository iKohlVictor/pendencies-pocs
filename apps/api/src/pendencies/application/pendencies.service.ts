import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import { Pendency, type PendencySnapshot } from '../domain/pendency.js';
import type { PendencyTypeId } from '../domain/pendency-type.js';
import { NotFoundError } from '../../shared/domain/domain-error.js';
import type { PendencyAction, PendencyEffect } from '../domain/pendency.machine.js';
import { PENDENCY_REPOSITORY, type PendencyRepository } from '../domain/pendency.repository.js';
import { FlowsService } from '../../flows/application/flows.service.js';
import { NOTIFICATION_OUTBOX, type NotificationOutbox } from './notification-outbox.js';
import { PendencyTypesService } from './pendency-types.service.js';

/** What the API returns: the stored pendency plus the label of its state in its flow version. */
export interface PendencyView extends PendencySnapshot {
  statusLabel: string;
}

/**
 * Use cases. Every command has the same shape: load the aggregate, call one
 * domain method, save (optimistic lock), then deliver the returned effects.
 */
@Injectable()
export class PendenciesService {
  constructor(
    @Inject(PENDENCY_REPOSITORY) private readonly pendencies: PendencyRepository,
    @Inject(NOTIFICATION_OUTBOX) private readonly outbox: NotificationOutbox,
    @Inject(FlowsService) private readonly flows: FlowsService,
    @Inject(PendencyTypesService) private readonly types: PendencyTypesService,
  ) {}

  /**
   * Called by the events module, which has already checked that the event exists.
   * The pendency starts on the version its type points to right now and keeps it.
   */
  async open(
    actor: Actor,
    eventId: string,
    type: PendencyTypeId,
    title?: string,
    paymentDueAt?: string,
  ): Promise<PendencyView> {
    const flow = await this.types.resolveFor(type);
    const pendency = Pendency.open(await this.pendencies.nextId(), eventId, type, actor, flow, title, paymentDueAt);
    await this.pendencies.save(pendency);
    return this.get(pendency.id);
  }

  async list(): Promise<PendencyView[]> {
    return Promise.all((await this.pendencies.findAll()).map((row) => this.view(row)));
  }

  async listByEvent(eventId: string): Promise<PendencyView[]> {
    return Promise.all((await this.pendencies.findByEventId(eventId)).map((row) => this.view(row)));
  }

  async get(id: string): Promise<PendencyView> {
    return this.toView(await this.load(id));
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

  private async execute(id: string, command: (pendency: Pendency) => PendencyEffect[]): Promise<PendencyView> {
    const pendency = await this.load(id);
    const effects = command(pendency);
    await this.pendencies.save(pendency);

    const saved = await this.get(id);
    for (const effect of effects) await this.deliver(effect, saved);
    return saved;
  }

  private async deliver(effect: PendencyEffect, pendency: PendencyView): Promise<void> {
    const reason = pendency.rejectionReason ? ` Reason: ${pendency.rejectionReason}` : '';
    await this.outbox.publish({
      at: new Date().toISOString(),
      pendencyId: pendency.id,
      role: effect.role,
      message: `Pendency ${pendency.id} ("${pendency.title}") is waiting for you (${pendency.statusLabel}).${reason}`,
    });
  }

  /** Rehydrates on the flow version the pendency was opened on, never the latest. */
  private async load(id: string): Promise<Pendency> {
    const row = await this.pendencies.findById(id);
    if (!row) throw new NotFoundError('Pendency', id);
    return this.hydrate(row);
  }

  private async hydrate(row: PendencySnapshot): Promise<Pendency> {
    return Pendency.restore(row, await this.flows.resolve(row.flow, row.flowVersion));
  }

  private async view(row: PendencySnapshot): Promise<PendencyView> {
    return this.toView(await this.hydrate(row));
  }

  private toView(pendency: Pendency): PendencyView {
    return { ...pendency.toSnapshot(), statusLabel: pendency.statusLabel };
  }
}
