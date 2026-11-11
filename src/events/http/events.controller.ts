import { Body, Controller, Get, HttpCode, Param, Post, UseFilters } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import { CurrentActor } from '../../shared/http/current-actor.decorator.js';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { EventsService } from '../application/events.service.js';
import { listEventTypes } from '../domain/event-type.js';

@Controller('events')
@UseFilters(DomainErrorFilter)
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Post()
  open(@CurrentActor() actor: Actor, @Body() body: { type?: string; name?: string } = {}) {
    return this.service.open(actor, body.type, body.name);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  /** Release actions the caller may take right now. */
  @Get(':id/actions')
  async actions(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return { actions: await this.service.availableActions(id, actor) };
  }

  @Post(':id/pendencies')
  openPendency(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { type?: string; title?: string } = {},
  ) {
    return this.service.openPendency(id, actor, body.type, body.title);
  }

  @Get(':id/pendencies')
  listPendencies(@Param('id') id: string) {
    return this.service.listPendencies(id);
  }

  @Post(':id/start-analysis')
  @HttpCode(200)
  startAnalysis(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.service.startAnalysis(id, actor);
  }

  @Post(':id/return')
  @HttpCode(200)
  returnToNotScheduled(@Param('id') id: string, @CurrentActor() actor: Actor, @Body() body: { reason?: string } = {}) {
    return this.service.returnToNotScheduled(id, actor, body.reason);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  schedule(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.service.schedule(id, actor);
  }
}

@Controller('event-types')
export class EventTypesController {
  /** The catalog: each type's default name and the pendencies it creates. */
  @Get()
  list() {
    return listEventTypes();
  }
}
