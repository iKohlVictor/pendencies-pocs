import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseFilters } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import { NOTIFICATION_OUTBOX, type NotificationOutbox } from '../application/notification-outbox.js';
import { PendenciesService } from '../application/pendencies.service.js';
import { CurrentActor } from '../../shared/http/current-actor.decorator.js';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';

@Controller('pendencies')
@UseFilters(DomainErrorFilter)
export class PendenciesController {
  constructor(private readonly service: PendenciesService) {}

  // Pendencies are opened inside an event: POST /events/:id/pendencies.

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  /** What the caller may do right now. A UI would render one button per action. */
  @Get(':id/actions')
  async actions(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return { actions: await this.service.availableActions(id, actor) };
  }

  @Post(':id/attach-document')
  @HttpCode(200)
  attachDocument(@Param('id') id: string, @CurrentActor() actor: Actor, @Body() body: { documentId?: string } = {}) {
    return this.service.attachDocument(id, actor, body.documentId);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(@Param('id') id: string, @CurrentActor() actor: Actor, @Body() body: { comment?: string } = {}) {
    return this.service.resolveWithComment(id, actor, body.comment);
  }

  @Post(':id/request-exception')
  @HttpCode(200)
  requestException(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { justification?: string } = {},
  ) {
    return this.service.requestException(id, actor, body.justification);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.service.approve(id, actor);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @CurrentActor() actor: Actor, @Body() body: { reason?: string } = {}) {
    return this.service.reject(id, actor, body.reason);
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NOTIFICATION_OUTBOX) private readonly outbox: NotificationOutbox) {}

  /** Everything the workflow would have sent. Filter with ?role=branch. */
  @Get()
  list(@Query('role') role?: string) {
    return this.outbox.list(role);
  }
}
